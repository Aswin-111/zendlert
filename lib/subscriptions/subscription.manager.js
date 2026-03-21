class SubscriptionManager {
    constructor() {
        /**
         * Structure:
         * Map<topic, Map<orgId, Set<call>>>
         */
        this.topics = new Map();
    }

    addSubscriber({ topic, orgId, call }) {
        if (!this.topics.has(topic)) {
            this.topics.set(topic, new Map());
        }

        const orgMap = this.topics.get(topic);

        if (!orgMap.has(orgId)) {
            orgMap.set(orgId, new Set());
        }

        orgMap.get(orgId).add(call);
    }

    removeSubscriber({ topic, orgId, call }) {
        const orgMap = this.topics.get(topic);
        if (!orgMap) return;

        const set = orgMap.get(orgId);
        if (!set) return;

        set.delete(call);

        if (set.size === 0) {
            orgMap.delete(orgId);
        }

        if (orgMap.size === 0) {
            this.topics.delete(topic);
        }
    }

    async broadcast({ topic, orgId, event = "UPDATE", buildPayload }) {
        const orgMap = this.topics.get(topic);
        if (!orgMap) return;

        const subscribers = orgMap.get(orgId);
        if (!subscribers) return;

        // 🔥 Single DB call
        const payload = await buildPayload();

        for (const call of subscribers) {
            if (call.cancelled) continue;

            try {
                call.write({
                    topic,
                    event,
                    data: JSON.stringify(payload),
                });
            } catch (e) {
                console.error("Broadcast error:", e);
            }
        }
    }
}

export const subscriptionManager = new SubscriptionManager();