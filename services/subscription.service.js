import path from "path";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";

import { getAuthContext } from "../utils/grpc-auth.js";
import { subscriptionManager } from "../subscriptions/subscription.manager.js";

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

    // ✅ SUBSCRIBE STREAM
    const subscribe = async (call) => {
        let auth;

        try {
            auth = getAuthContext(call);
        } catch (e) {
            call.emit("error", {
                code: grpc.status.UNAUTHENTICATED,
                message: "Invalid token",
            });
            return;
        }

        const { topic, filters } = call.request;
        const { organization_id } = auth;

        if (!topic) {
            call.emit("error", {
                code: grpc.status.INVALID_ARGUMENT,
                message: "topic is required",
            });
            return;
        }

        console.log("[SUBSCRIBE]", { topic, organization_id, filters });

        // ✅ Register subscriber
        subscriptionManager.addSubscriber({
            topic,
            orgId: organization_id,
            call,
        });

        // ✅ Send INIT event (optional placeholder)
        call.write({
            topic,
            event: "INIT",
            data: JSON.stringify({ message: "Subscribed successfully" }),
        });

        // ✅ Handle disconnect
        call.on("cancelled", () => {
            console.log("[UNSUBSCRIBE]", { topic, organization_id });

            subscriptionManager.removeSubscriber({
                topic,
                orgId: organization_id,
                call,
            });

            call.end();
        });
    };

    // ✅ Ping
    const ping = (call, callback) => {
        callback(null, { message: "pong" });
    };

    server.addService(proto.SubscriptionService.service, {
        Subscribe: subscribe,
        Ping: ping,
    });

    server.bindAsync(
        "0.0.0.0:50052",
        grpc.ServerCredentials.createInsecure(),
        () => {
            console.log("Subscription gRPC running on 50052");
        }
    );
}