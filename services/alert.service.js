// services/alert.service.js
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import { AlertStatus } from '@prisma/client';

// Import the controller logic for the unary (non-streaming) call
import { getAlertData } from '../controllers/grpc.alert.controller.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Utility: convert JS Date to google.protobuf.Timestamp
function toProtoTimestamp(date) {
    if (!date) return null;
    const ms = date.getTime();
    return {
        seconds: Math.floor(ms / 1000),
        nanos: (ms % 1000) * 1e6,
    };
}

/**
 * Start the gRPC Alert Service with both:
 *  - GetAlertData (unary)
 *  - StreamActiveAlerts (server streaming, includes live response counters)
 *
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export function startAlertService(prisma) {
    console.log('🚀 Initializing gRPC Alert Service...');

    const protoPath = path.join(__dirname, '../grpc/alert.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition).alert;

    // ==============================
    // Server-Streaming Implementation
    // ==============================
    const streamActiveAlerts = (call) => {
        const { organization_id } = call.request;
        if (!organization_id) {
            call.emit('error', {
                code: grpc.status.INVALID_ARGUMENT,
                message: 'organization_id is required',
            });
            return;
        }
        console.log(`[gRPC Stream] Client connected for organization: ${organization_id}`);

        const sendUpdates = async () => {
            try {
                if (call.cancelled) return;

                // 1) Pull active alerts for org
                const activeAlerts = await prisma.alerts.findMany({
                    where: {
                        organization_id,
                        status: AlertStatus.active,
                    },
                    orderBy: { created_at: 'desc' },
                    include: {
                        emergency_type: { select: { name: true } },
                    },
                });

                // Early flush if none
                if (!activeAlerts.length) {
                    call.write({ active_alerts: [] });
                    return;
                }

                const alertIds = activeAlerts.map((a) => a.id);

                // 2) Total recipients per alert
                const totals = await prisma.notification_Recipients.groupBy({
                    by: ['alert_id'],
                    where: { alert_id: { in: alertIds } },
                    _count: { _all: true },
                });
                const totalMap = new Map(totals.map((t) => [t.alert_id, t._count._all]));

                // 3) Response breakdown per alert
                // response ∈ {'safe','not_safe','evacuated','seeking_shelter', null}
                const responseGroups = await prisma.notification_Recipients.groupBy({
                    by: ['alert_id', 'response'],
                    where: { alert_id: { in: alertIds } },
                    _count: { _all: true },
                });

                const statsByAlert = new Map();
                for (const id of alertIds) {
                    statsByAlert.set(id, {
                        safe: 0,
                        not_safe: 0,
                        evacuated: 0,
                        seeking_shelter: 0,
                    });
                }
                for (const row of responseGroups) {
                    const store = statsByAlert.get(row.alert_id);
                    if (!store) continue;
                    if (row.response === 'safe') store.safe += row._count._all;
                    else if (row.response === 'not_safe') store.not_safe += row._count._all;
                    else if (row.response === 'evacuated') store.evacuated += row._count._all;
                    else if (row.response === 'seeking_shelter') store.seeking_shelter += row._count._all;
                    // if null -> handled as "not responded" below
                }

                // 4) Build gRPC payload entries
                const alertMessages = activeAlerts.map((alert) => {
                    const totalsForAlert = totalMap.get(alert.id) ?? 0;
                    const s = statsByAlert.get(alert.id) ?? {
                        safe: 0,
                        not_safe: 0,
                        evacuated: 0,
                        seeking_shelter: 0,
                    };
                    const responded = s.safe + s.not_safe + s.evacuated + s.seeking_shelter;
                    const notResponded = Math.max(totalsForAlert - responded, 0);

                    return {
                        alert_id: alert.id,
                        emergency_type: alert.emergency_type?.name ?? '',
                        message: alert.message,
                        severity: String(alert.severity ?? ''), // ensure string for proto
                        start_time: toProtoTimestamp(alert.start_time),

                        // NEW counters
                        safe_count: s.safe,
                        need_help_count: s.not_safe,
                        evacuated_count: s.evacuated,
                        seeking_shelter_count: s.seeking_shelter,
                        not_responded_count: notResponded,
                        total_recipients: totalsForAlert,
                    };
                });

                call.write({ active_alerts: alertMessages });
            } catch (error) {
                console.error(`[gRPC Stream] Error for org ${organization_id}:`, error);
            }
        };

        // initial push + interval
        sendUpdates();
        const intervalId = setInterval(sendUpdates, 15000); // every 15s

        call.on('cancelled', () => {
            console.log(`[gRPC Stream] Client disconnected for org: ${organization_id}`);
            clearInterval(intervalId);
            call.end();
        });
    };

    // ===================
    // gRPC Server wiring
    // ===================
    const server = new grpc.Server();

    server.addService(proto.AlertService.service, {
        GetAlertData: (call, callback) => getAlertData(call, callback, prisma),
        StreamActiveAlerts: streamActiveAlerts,
    });

    const addr = '0.0.0.0:5051';
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err) => {
        if (err) {
            console.error('❌ gRPC Alert Service bind error:', err);
            return;
        }
        console.log(`🟢 gRPC Alert Service running at ${addr}`);
    });
}
