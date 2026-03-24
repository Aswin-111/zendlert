import path from "path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import prisma from "../utils/prisma.js";

import { getAuthContext } from "../utils/grpc-auth.js";

class SubscriptionManager {
    constructor() {
        /**
         * Map key format:
         * `${topic}::${orgId}`
         *
         * Value:
         * Set<ServerWritableStream>
         */
        this.subscribers = new Map();
    }

    _getKey(topic, orgId) {
        return `${topic}::${orgId}`;
    }

    addSubscriber({ topic, orgId, call }) {
        const key = this._getKey(topic, orgId);

        if (!this.subscribers.has(key)) {
            this.subscribers.set(key, new Set());
        }

        this.subscribers.get(key).add(call);
    }

    removeSubscriber({ topic, orgId, call }) {
        const key = this._getKey(topic, orgId);
        const bucket = this.subscribers.get(key);

        if (!bucket) return;

        bucket.delete(call);

        if (bucket.size === 0) {
            this.subscribers.delete(key);
        }
    }

    publish({ topic, orgId, event, data }) {
        const key = this._getKey(topic, orgId);
        const bucket = this.subscribers.get(key);

        if (!bucket || bucket.size === 0) return;

        const message = {
            topic,
            event,
            data: JSON.stringify(data ?? {}),
        };

        for (const call of [...bucket]) {
            try {
                call.write(message);
            } catch (error) {
                console.error("[SUBSCRIPTION_PUBLISH_ERROR]", {
                    topic,
                    orgId,
                    event,
                    error: error?.message,
                });

                this.removeSubscriber({ topic, orgId, call });

                try {
                    call.end();
                } catch (_) { }
            }
        }
    }

    publishToTopicForAllOrgs({ topic, event, data }) {
        for (const [key, bucket] of this.subscribers.entries()) {
            if (!key.startsWith(`${topic}::`)) continue;

            const message = {
                topic,
                event,
                data: JSON.stringify(data ?? {}),
            };

            for (const call of [...bucket]) {
                try {
                    call.write(message);
                } catch (error) {
                    console.error("[SUBSCRIPTION_BROADCAST_ERROR]", {
                        key,
                        topic,
                        event,
                        error: error?.message,
                    });

                    bucket.delete(call);

                    try {
                        call.end();
                    } catch (_) { }
                }
            }

            if (bucket.size === 0) {
                this.subscribers.delete(key);
            }
        }
    }
}


const subscriptionManager = new SubscriptionManager();
async function getOrganizationSubscriptionPayload(organizationId) {
    const rows = await prisma.$queryRawUnsafe(
        `
      SELECT
        s.id,
        s.status,
        s.payment_status,
        s.current_period_start,
        s.current_period_end,
        p.plan_name,
        p.user_limit,
        p.area_limit,
        p.site_limit,
        p.alert_limit
      FROM "Subscriptions" s
      INNER JOIN "Subscription_Plans" p
        ON p.id = s.subscription_plan_id
      WHERE s.organization_id = $1
        AND s.status = 'active'
      ORDER BY s.created_at DESC
      LIMIT 1
    `,
        organizationId
    );

    const subscription = rows?.[0] ?? null;

    if (!subscription) {
        return {
            type: "subscription",
            subscription: {
                id: null,
                status: "inactive",
                payment_status: null,
                current_period_start: null,
                current_period_end: null,
                plan_name: null,
                user_limit: 0,
                area_limit: 0,
                site_limit: 0,
                alert_limit: 0,
            },
        };
    }

    return {
        type: "subscription",
        subscription: {
            id: subscription.id,
            status: subscription.status,
            payment_status: subscription.payment_status,
            current_period_start: subscription.current_period_start,
            current_period_end: subscription.current_period_end,
            plan_name: subscription.plan_name,
            user_limit: Number(subscription.user_limit ?? 0),
            area_limit: Number(subscription.area_limit ?? 0),
            site_limit: Number(subscription.site_limit ?? 0),
            alert_limit: Number(subscription.alert_limit ?? 0),
        },
    };
}

function writeGrpcError(call, code, message) {
    call.emit("error", {
        code,
        message,
    });
}

export function publishSubscriptionUpdate(orgId, payload) {
    subscriptionManager.publish({
        topic: "subscription",
        orgId,
        event: "UPDATE",
        data: payload,
    });
}

export async function notifySubscriptionUpdate(orgId) {
    try {
        const payload = await getOrganizationSubscriptionPayload(orgId);

        subscriptionManager.publish({
            topic: "subscription",
            orgId,
            event: "UPDATE",
            data: payload,
        });
    } catch (error) {
        console.error("[NOTIFY_SUBSCRIPTION_UPDATE_ERROR]", {
            orgId,
            error: error?.message,
        });
    }
}

export function startSubscriptionService() {
    const protoPath = path.resolve("grpc/subscription.proto");

    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
    });

    const proto = grpc.loadPackageDefinition(packageDefinition).subscription;
    const server = new grpc.Server();

    const subscribe = async (call) => {
        let auth;

        try {
            auth = getAuthContext(call);
        } catch (error) {
            writeGrpcError(
                call,
                error?.code ?? grpc.status.UNAUTHENTICATED,
                error?.message || "Unauthorized"
            );
            return;
        }

        const { topic, filters } = call.request || {};
        const { organization_id } = auth;

        if (!organization_id) {
            writeGrpcError(
                call,
                grpc.status.UNAUTHENTICATED,
                "organization_id missing in auth token"
            );
            return;
        }

        if (!topic || typeof topic !== "string") {
            writeGrpcError(call, grpc.status.INVALID_ARGUMENT, "topic is required");
            return;
        }

        console.log("[SUBSCRIBE]", {
            topic,
            organization_id,
            filters: filters || {},
        });

        subscriptionManager.addSubscriber({
            topic,
            orgId: organization_id,
            call,
        });

        let cleanedUp = false;

        const cleanup = () => {
            if (cleanedUp) return;
            cleanedUp = true;

            console.log("[UNSUBSCRIBE]", {
                topic,
                organization_id,
            });

            subscriptionManager.removeSubscriber({
                topic,
                orgId: organization_id,
                call,
            });

            try {
                call.end();
            } catch (_) { }
        };

        call.on("cancelled", cleanup);
        call.on("close", cleanup);
        call.on("error", (error) => {
            console.error("[SUBSCRIBE_STREAM_ERROR]", {
                topic,
                organization_id,
                error: error?.message,
            });
            cleanup();
        });

        try {
            let initPayload = {
                type: "generic",
                message: "Subscribed successfully",
            };

            if (topic === "subscription") {
                initPayload = await getOrganizationSubscriptionPayload(organization_id);
            }

            call.write({
                topic,
                event: "INIT",
                data: JSON.stringify(initPayload),
            });
        } catch (error) {
            console.error("[SUBSCRIBE_INIT_ERROR]", {
                topic,
                organization_id,
                error: error?.message,
            });

            writeGrpcError(
                call,
                grpc.status.INTERNAL,
                "Failed to initialize subscription stream"
            );
            cleanup();
        }
    };

    const ping = async (_call, callback) => {
        try {
            callback(null, { message: "pong" });
        } catch (error) {
            callback({
                code: grpc.status.INTERNAL,
                message: "Ping failed",
            });
        }
    };

    server.addService(proto.SubscriptionService.service, {
        Subscribe: subscribe,
        Ping: ping,
    });

    server.bindAsync(
        "0.0.0.0:50052",
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
            if (error) {
                console.error("[SUBSCRIPTION_GRPC_BIND_ERROR]", error);
                throw error;
            }

            server.start();
            console.log(`Subscription gRPC running on ${port}`);
        }
    );

    return server;
}