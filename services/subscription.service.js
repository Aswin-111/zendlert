import path from "path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import prisma from "../utils/prisma.js";

import { getAuthContext } from "../utils/grpc-auth.js";

// ─── Plan limits ──────────────────────────────────────────────────────────────
// The free plan is unlimited on every axis (users / sites / areas / alerts).
// We send -1 to mean "unlimited" and also send explicit boolean flags so the
// client never has to guess what -1 means.

export const UNLIMITED = -1;

const FREE_PLAN_NAME = "free";          // must match Subscription_Plans.plan_name
const FREE_PLAN_STATUS = "active";      // free orgs are usable, not "inactive"
const FREE_PLAN_PAYMENT_STATUS = "not_required";

const LIMIT_FIELDS = ["user_limit", "area_limit", "site_limit", "alert_limit"];

function isFreePlanName(planName) {
    return String(planName ?? "").trim().toLowerCase() === FREE_PLAN_NAME;
}

/** A limit is "no cap" when it is negative / null / undefined. */
export function isUnlimitedLimit(limit) {
    return limit === null || limit === undefined || Number(limit) < 0;
}

/**
 * Use this wherever a plan limit is enforced.
 * `count >= limit` is WRONG once limit can be -1 — it would block everything.
 */
export function hasReachedLimit(currentCount, limit) {
    if (isUnlimitedLimit(limit)) return false;
    return Number(currentCount) >= Number(limit);
}

function buildPlanLimits(plan) {
    // Free plan (or no plan row at all) → unlimited, regardless of what is stored
    // in Subscription_Plans (those columns default to 0 in the schema).
    if (!plan || isFreePlanName(plan.plan_name)) {
        return LIMIT_FIELDS.reduce((acc, field) => {
            acc[field] = UNLIMITED;
            return acc;
        }, {});
    }

    return LIMIT_FIELDS.reduce((acc, field) => {
        acc[field] = isUnlimitedLimit(plan[field])
            ? UNLIMITED
            : Number(plan[field]);
        return acc;
    }, {});
}

function toIsoDate(value) {
    if (!value) return null;
    return value instanceof Date ? value.toISOString() : value;
}

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

/**
 * Look up the free plan row so we can send its real id / name / description.
 * If the row does not exist we still return a synthetic free plan, so the
 * client is never left with nulls and zeroes.
 */
async function findFreePlan() {
    try {
        return await prisma.subscription_Plans.findFirst({
            where: {
                plan_name: { equals: FREE_PLAN_NAME, mode: "insensitive" },
            },
            select: {
                id: true,
                plan_name: true,
                description: true,
                user_limit: true,
                area_limit: true,
                site_limit: true,
                alert_limit: true,
            },
        });
    } catch (error) {
        console.error("[FREE_PLAN_LOOKUP_ERROR]", { error: error?.message });
        return null;
    }
}

function buildSubscriptionPayload({ subscription, plan }) {
    const limits = buildPlanLimits(plan);
    const is_free_plan = !plan || isFreePlanName(plan.plan_name);

    return {
        type: "subscription",
        subscription: {
            id: subscription?.id ?? null,
            subscription_plan_id: plan?.id ?? null,
            plan_name: plan?.plan_name ?? FREE_PLAN_NAME,
            description: plan?.description ?? null,

            status: subscription?.status ?? FREE_PLAN_STATUS,
            payment_status:
                subscription?.payment_status ??
                (is_free_plan ? FREE_PLAN_PAYMENT_STATUS : null),

            current_period_start: toIsoDate(subscription?.current_period_start),
            current_period_end: toIsoDate(subscription?.current_period_end),

            is_free_plan,
            is_unlimited: LIMIT_FIELDS.every((field) =>
                isUnlimitedLimit(limits[field]),
            ),

            ...limits,
        },
    };
}

/**
 * Resolves the org's current plan.
 *
 * 1. Active / trialing Subscriptions row  → that plan's limits.
 * 2. Row exists but points at the free plan → unlimited (schema stores 0s).
 * 3. No row at all (or cancelled / expired) → free plan, unlimited.
 */
export async function getOrganizationSubscriptionPayload(organizationId) {
    const subscription = await prisma.subscriptions.findFirst({
        where: {
            organization_id: organizationId,
            status: { in: ["active", "trialing"] },
        },
        orderBy: { created_at: "desc" },
        select: {
            id: true,
            status: true,
            payment_status: true,
            current_period_start: true,
            current_period_end: true,
            plan: {
                select: {
                    id: true,
                    plan_name: true,
                    description: true,
                    user_limit: true,
                    area_limit: true,
                    site_limit: true,
                    alert_limit: true,
                },
            },
        },
    });

    if (!subscription) {
        // No paid subscription → the org is on the free plan.
        const freePlan = await findFreePlan();
        return buildSubscriptionPayload({ subscription: null, plan: freePlan });
    }

    return buildSubscriptionPayload({
        subscription,
        plan: subscription.plan,
    });
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

    const addr = '0.0.0.0:5053';
    server.bindAsync(addr,
        grpc.ServerCredentials.createInsecure(),
        (error, port) => {
            if (error) {
                console.error("[SUBSCRIPTION_GRPC_BIND_ERROR]", error);
                throw error;
            }

            server.start();
            console.log(`Subscription gRPC running on ${addr} (port ${port})`);
        }
    );

    return server;
}