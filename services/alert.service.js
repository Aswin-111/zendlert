import path, { dirname } from "path";
import { fileURLToPath } from "url";
import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import { AlertStatus } from "@prisma/client";

import { getAlertData } from "../controllers/grpc.alert.controller.js";
import { recordEmployeeAlertResponse } from "./employeeAlertResponse.service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function toProtoTimestamp(date) {
    if (!date) return null;
    const ms = date.getTime();
    return { seconds: Math.floor(ms / 1000), nanos: (ms % 1000) * 1e6 };
}

async function buildActiveAlertsPayload(prisma, organization_id) {
    const activeAlerts = await prisma.alerts.findMany({
        where: { organization_id, status: AlertStatus.active },
        orderBy: { created_at: "desc" },
        include: { emergency_type: { select: { name: true } } },
    });

    if (!activeAlerts.length) return [];

    const alertIds = activeAlerts.map((a) => a.id);

    // totals
    const totals = await prisma.notification_Recipients.groupBy({
        by: ["alert_id"],
        where: { alert_id: { in: alertIds } },
        _count: { _all: true },
    });
    const totalMap = new Map(totals.map((t) => [t.alert_id, t._count._all]));

    // response groups
    const responseGroups = await prisma.notification_Recipients.groupBy({
        by: ["alert_id", "response"],
        where: { alert_id: { in: alertIds } },
        _count: { _all: true },
    });

    // last response update per alert
    const maxUpdated = await prisma.notification_Recipients.groupBy({
        by: ["alert_id"],
        where: { alert_id: { in: alertIds }, response_updated_at: { not: null } },
        _max: { response_updated_at: true },
    });
    const lastUpdatedMap = new Map(
        maxUpdated.map((m) => [m.alert_id, m._max.response_updated_at])
    );

    // locations
    const [alertSites, alertAreas] = await Promise.all([
        prisma.alert_Sites.findMany({
            where: { alert_id: { in: alertIds } },
            include: { site: { select: { name: true, city: true, state: true } } },
        }),
        prisma.alert_Areas.findMany({
            where: { alert_id: { in: alertIds } },
            include: { area: { select: { name: true, site_id: true } } },
        }),
    ]);

    const siteIdsFromAreas = Array.from(
        new Set(alertAreas.map((x) => x.area?.site_id).filter(Boolean))
    );
    const sitesForAreas = siteIdsFromAreas.length
        ? await prisma.sites.findMany({
            where: { id: { in: siteIdsFromAreas } },
            select: { id: true, name: true },
        })
        : [];
    const siteNameById = new Map(sitesForAreas.map((s) => [s.id, s.name]));

    const locationsByAlertId = new Map();
    for (const id of alertIds) locationsByAlertId.set(id, []);

    for (const row of alertSites) {
        const arr = locationsByAlertId.get(row.alert_id);
        if (!arr) continue;
        const s = row.site;
        if (!s?.name) continue;
        const extra = [s.city, s.state].filter(Boolean).join(", ");
        arr.push(extra ? `${s.name} (${extra})` : s.name);
    }

    for (const row of alertAreas) {
        const arr = locationsByAlertId.get(row.alert_id);
        if (!arr) continue;
        const a = row.area;
        if (!a?.name) continue;
        const siteName = siteNameById.get(a.site_id);
        arr.push(siteName ? `${siteName} — ${a.name}` : a.name);
    }

    // stats
    const statsByAlert = new Map();
    for (const id of alertIds) {
        statsByAlert.set(id, {
            safe: 0,
            need_help: 0,
            emergency_help_needed: 0,
            // legacy counters kept
            evacuated: 0,
            seeking_shelter: 0,
        });
    }

    for (const row of responseGroups) {
        const s = statsByAlert.get(row.alert_id);
        if (!s) continue;

        if (row.response === "safe") s.safe += row._count._all;
        else if (row.response === "need_help") s.need_help += row._count._all;
        else if (row.response === "emergency_help_needed")
            s.emergency_help_needed += row._count._all;

        // If old values exist temporarily, you can map them too:
        // else if (row.response === "not_safe") s.need_help += row._count._all;
    }

    return activeAlerts.map((alert) => {
        const totalsForAlert = totalMap.get(alert.id) ?? 0;
        const s = statsByAlert.get(alert.id) ?? {
            safe: 0,
            need_help: 0,
            emergency_help_needed: 0,
            evacuated: 0,
            seeking_shelter: 0,
        };

        const responded =
            s.safe + s.need_help + s.emergency_help_needed + s.evacuated + s.seeking_shelter;

        const notResponded = Math.max(totalsForAlert - responded, 0);

        return {
            alert_id: alert.id,
            emergency_type: alert.emergency_type?.name ?? "",
            message: alert.message ?? "",
            severity: String(alert.severity ?? ""),
            start_time: toProtoTimestamp(alert.start_time ?? alert.created_at),

            safe_count: s.safe,
            need_help_count: s.need_help,
            evacuated_count: s.evacuated,
            seeking_shelter_count: s.seeking_shelter,
            not_responded_count: notResponded,
            total_recipients: totalsForAlert,

            locations: locationsByAlertId.get(alert.id) ?? [],
            status: String(alert.status ?? ""),
            report: alert.action_required ?? "",
            last_response_updated_at: toProtoTimestamp(lastUpdatedMap.get(alert.id) ?? null),
        };
    });
}

function mapProtoResponseToDbEnum(protoEnumValue) {
    if (protoEnumValue === 1) return "safe";
    if (protoEnumValue === 2) return "need_help";
    if (protoEnumValue === 3) return "emergency_help_needed";
    return null;
}

export function startAlertService(prisma) {
    console.log("🚀 Initializing gRPC Alert Service...");

    const protoPath = path.join(__dirname, "../grpc/alert.proto");
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition).alert;

    const getActiveAlertsUnary = async (call, callback) => {
        try {
            const { organization_id } = call.request;
            if (!organization_id) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: "organization_id is required",
                });
            }
            const payload = await buildActiveAlertsPayload(prisma, organization_id);
            return callback(null, { active_alerts: payload });
        } catch (e) {
            console.error("[gRPC GetActiveAlerts] error:", e);
            return callback({ code: grpc.status.INTERNAL, message: "Internal server error" });
        }
    };

    const streamActiveAlerts = (call) => {
        const { organization_id } = call.request;
        if (!organization_id) {
            call.emit("error", { code: grpc.status.INVALID_ARGUMENT, message: "organization_id is required" });
            return;
        }

        console.log(`[gRPC Stream] Client connected for organization: ${organization_id}`);

        const sendUpdates = async () => {
            try {
                if (call.cancelled) return;
                const payload = await buildActiveAlertsPayload(prisma, organization_id);
                call.write({ active_alerts: payload });
            } catch (e) {
                console.error(`[gRPC Stream] Error for org ${organization_id}:`, e);
            }
        };

        sendUpdates();
        const intervalId = setInterval(sendUpdates, 15000);

        call.on("cancelled", () => {
            console.log(`[gRPC Stream] Client disconnected for org: ${organization_id}`);
            clearInterval(intervalId);
            call.end();
        });
    };

    const updateEmployeeResponse = async (call, callback) => {
        try {
            const { alert_id, user_id, response } = call.request;

            if (!alert_id || !user_id) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: "alert_id and user_id are required",
                });
            }

            const dbResponse = mapProtoResponseToDbEnum(response);
            if (!dbResponse) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: "Invalid response" });
            }

            // ✅ Reuse the exact same logic as REST (no duplication)
            const result = await recordEmployeeAlertResponse({
                alert_id,
                user_id,
                response: dbResponse,
            });

            return callback(null, {
                ok: true,
                message: "Response updated",
                response_updated_at: toProtoTimestamp(result.response_updated_at),
            });
        } catch (e) {
            console.error("[gRPC UpdateEmployeeResponse] error:", e);
            return callback({ code: grpc.status.INTERNAL, message: "Internal server error" });
        }
    };

    const server = new grpc.Server();

    server.addService(proto.AlertService.service, {
        GetAlertData: (call, callback) => getAlertData(call, callback, prisma),
        StreamActiveAlerts: streamActiveAlerts,
        GetActiveAlerts: getActiveAlertsUnary,
        UpdateEmployeeResponse: updateEmployeeResponse,
    });

    const addr = "0.0.0.0:5051";
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err) => {
        if (err) {
            console.error("❌ gRPC Alert Service bind error:", err);
            return;
        }
        console.log(`🟢 gRPC Alert Service running at ${addr}`);
    });
}
