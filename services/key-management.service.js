import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';
import crypto from 'crypto';
import logger from '../utils/logger.js';
import { utcNow } from '../utils/datetime.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Server-side sealing helpers ─────────────────────────────────────────────
// The SERVER_SEAL_KEY env var is a 32-byte hex string (64 hex chars).
// Generate once with: node -e "console.log(crypto.randomBytes(32).toString('hex'))"
// Store it in your .env and in your secrets manager. Never commit it.

// function getSealKey() {
//     const hex = process.env.SERVER_SEAL_KEY;
//     if (!hex || hex.length !== 64) {
//         throw new Error('SERVER_SEAL_KEY env var missing or invalid — must be 64 hex chars');
//     }
//     return Buffer.from(hex, 'hex');
// }

// Encrypts a buffer with AES-256-GCM using the server seal key.
// Returns base64(iv || ciphertext || authTag) — same format as client blobs.
// function sealBuffer(plaintext) {
//     const key = getSealKey();
//     const iv = crypto.randomBytes(12);
//     const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
//     const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
//     const tag = cipher.getAuthTag();
//     return Buffer.concat([iv, ct, tag]).toString('base64');
// }

// Decrypts a base64(iv || ciphertext || authTag) blob with the server seal key.
function unsealWithRsa(base64Blob) {
    const privateKeyPem = process.env.SERVER_RSA_PRIVATE_KEY;
    if (!privateKeyPem) throw new Error('SERVER_RSA_PRIVATE_KEY not configured');

    const privateKey = crypto.createPrivateKey({
        key: privateKeyPem.replace(/\\n/g, '\n'),
        format: 'pem',
        type: 'pkcs8',
    });

    const encrypted = Buffer.from(base64Blob, 'base64');
    return crypto.privateDecrypt(
        {
            key: privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        encrypted,
    );
}

// Re-wraps a plaintext private key for a specific device using RSA-OAEP.
// The device's public key is SPKI base64. Returns base64 wrapped key.
function wrapKeyForDevice(plaintextPrivateKey, devicePublicKeySpkiBase64) {
    const pubKeyDer = Buffer.from(devicePublicKeySpkiBase64, 'base64');
    const pubKey = crypto.createPublicKey({ key: pubKeyDer, format: 'der', type: 'spki' });
    const wrapped = crypto.publicEncrypt(
        { key: pubKey, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
        plaintextPrivateKey,
    );
    return wrapped.toString('base64');
}

// ─── Service bootstrap ────────────────────────────────────────────────────────

export function startKeyManagementService(prisma, firebaseAdmin) {
    logger.info('key_management.grpc.initializing');

    const protoPath = path.join(__dirname, '../grpc/key_management.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true, longs: String, enums: String, defaults: true, oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition).keymanagement;

    // ─── UploadKeyBackup ───────────────────────────────────────────────────────
    // Called once: immediately after first-time key pair generation on a device.
    // Stores the client-encrypted blob AND creates the server-sealed fallback.
    // The sealed_blob field is the private key encrypted with the server's seal key —
    // the client sends this as part of the same request so we never need to ask for
    // it again. The client encrypts it using the server's *public* key (RSA-OAEP),
    // which you publish at a well-known endpoint (see note below).
    // ──────────────────────────────────────────────────────────────────────────
    async function UploadKeyBackup(call, callback) {
        try {
            const {
                user_id, organization_id,
                public_key,
                device_id, platform, fcm_token,
                sealed_blob,  // client encrypted the private key with server's public key
            } = call.request;

            if (!user_id || !organization_id || !public_key || !device_id || !platform) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id, organization_id, public_key, device_id, platform are required',
                });
            }

            // sealed_blob is optional on the first call if you want to simplify the
            // initial implementation — but strongly recommended to include it.
            // If absent, Scenario C (server-sealed recovery) won't be available for this user.

            await prisma.$transaction(async (tx) => {
                // 1. Store the key backup record (public key only for OTP accounts).
                await tx.user_Key_Backups.upsert({
                    where: { user_id },
                    create: {
                        user_id,
                        encrypted_private_key: '', // unused for OTP accounts
                        public_key,
                        kdf_salt: '',
                        kdf_iterations: 0,
                        version: 1,
                    },
                    update: {
                        public_key,
                        version: { increment: 1 },
                    },
                });

                // 2. Keep Users.e2ee_public_key in sync — chat.service.js reads this.
                await tx.users.update({
                    where: { user_id },
                    data: { e2ee_public_key: public_key },
                });

                // 3. Register the first device.
                await tx.user_Devices.upsert({
                    where: { user_id_device_id: { user_id, device_id } },
                    create: { user_id, device_id, platform, fcm_token, is_active: true },
                    update: { platform, fcm_token, is_active: true, last_seen: utcNow() },
                });

                // 4. Store server-sealed fallback if provided.
                if (sealed_blob) {
                    await tx.server_Sealed_Key_Backups.upsert({
                        where: { user_id },
                        create: { user_id, sealed_blob, key_version: 'v1' },
                        update: { sealed_blob, key_version: 'v1', updated_at: utcNow() },
                    });
                }
            });

            logger.info('key_management.backup_uploaded', { meta: { user_id, device_id } });
            callback(null, {});
        } catch (err) {
            logger.error('key_management.upload_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to upload key backup' });
        }
    }

    // ─── GetKeyBackup ──────────────────────────────────────────────────────────
    // New device calls this after login to check what backup exists.
    // Returns NOT_FOUND if this user has never set up keys (first ever login).
    // ──────────────────────────────────────────────────────────────────────────
    async function GetKeyBackup(call, callback) {
        try {
            const { user_id, organization_id } = call.request;
            if (!user_id || !organization_id) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id and organization_id are required',
                });
            }

            const backup = await prisma.user_Key_Backups.findUnique({ where: { user_id } });
            if (!backup) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'No key backup found — generate a new key pair',
                });
            }

            callback(null, {
                public_key: backup.public_key,
                kdf_algorithm: backup.kdf_algorithm,
                version: backup.version,
            });
        } catch (err) {
            logger.error('key_management.get_backup_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to retrieve key backup' });
        }
    }

    // ─── RegisterDevice ────────────────────────────────────────────────────────
    // Called after key recovery is complete (transfer approved or sealed recovery done).
    // Safe to call multiple times — upsert handles reinstalls on same device_id.
    // ──────────────────────────────────────────────────────────────────────────
    async function RegisterDevice(call, callback) {
        try {
            const { user_id, organization_id, device_id, platform, fcm_token } = call.request;
            if (!user_id || !organization_id || !device_id || !platform) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id, organization_id, device_id, platform are required',
                });
            }

            await prisma.user_Devices.upsert({
                where: { user_id_device_id: { user_id, device_id } },
                create: { user_id, device_id, platform, fcm_token, is_active: true },
                update: { platform, fcm_token, is_active: true, last_seen: utcNow() },
            });

            logger.info('key_management.device_registered', { meta: { user_id, device_id } });
            callback(null, {});
        } catch (err) {
            logger.error('key_management.register_device_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to register device' });
        }
    }

    // ─── RequestKeyTransfer ────────────────────────────────────────────────────
    // New device generates a fresh ephemeral EC key pair locally and posts
    // the ephemeral PUBLIC key here. We store it and return a transfer_id.
    // The new device then sends a push notification to all trusted devices
    // (via their FCM tokens) so they know to check ListPendingTransfers.
    // ──────────────────────────────────────────────────────────────────────────
    async function RequestKeyTransfer(call, callback) {
        try {
            const { user_id, organization_id, requesting_device_id, ephemeral_public_key } = call.request;
            if (!user_id || !organization_id || !requesting_device_id || !ephemeral_public_key) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id, organization_id, requesting_device_id, ephemeral_public_key are required',
                });
            }

            // Expire transfer requests after 10 minutes.
            const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

            const transfer = await prisma.device_Key_Transfers.create({
                data: {
                    user_id,
                    requesting_device_id,
                    ephemeral_public_key,
                    status: 'pending',
                    expires_at: expiresAt,
                },
            });

            // Notify all other active devices belonging to this user so they can show
            // an approval prompt. We look up their FCM tokens from User_Devices.
            const trustedDevices = await prisma.user_Devices.findMany({
                where: {
                    user_id,
                    is_active: true,
                    NOT: { device_id: requesting_device_id },
                },
                select: { fcm_token: true, device_id: true },
            });

            const notifyPromises = trustedDevices
                .filter(d => d.fcm_token)
                .map(d =>
                    firebaseAdmin.messaging().send({
                        token: d.fcm_token,
                        data: {
                            type: 'key_transfer_request',
                            transfer_id: transfer.id,
                            user_id,
                            expires_at: expiresAt.toISOString(),
                        },
                        // Data-only message — no notification banner. The Flutter app handles
                        // the UI prompt itself so it can show the right screen.
                        android: { priority: 'high' },
                        apns: { payload: { aps: { contentAvailable: true } } },
                    }).catch(err =>
                        logger.warn('key_management.transfer_notify_failed', {
                            meta: { device_id: d.device_id, error: err.message },
                        })
                    )
                );

            await Promise.all(notifyPromises);

            logger.info('key_management.transfer_requested', {
                meta: { user_id, transfer_id: transfer.id, trusted_device_count: trustedDevices.length },
            });

            callback(null, {
                transfer_id: transfer.id,
                expires_at: expiresAt.toISOString(),
            });
        } catch (err) {
            logger.error('key_management.request_transfer_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to request key transfer' });
        }
    }

    // ─── PollKeyTransfer ───────────────────────────────────────────────────────
    // New device calls this every ~5 seconds while showing a "Waiting for approval"
    // screen. Returns the wrapped key once the trusted device has approved.
    // ──────────────────────────────────────────────────────────────────────────
    async function PollKeyTransfer(call, callback) {
        try {
            const { transfer_id, user_id } = call.request;
            if (!transfer_id || !user_id) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'transfer_id and user_id are required',
                });
            }

            const transfer = await prisma.device_Key_Transfers.findFirst({
                where: { id: transfer_id, user_id },
            });

            if (!transfer) {
                return callback({ code: grpc.status.NOT_FOUND, message: 'Transfer not found' });
            }

            // Auto-expire transfers past their expiry time.
            if (transfer.status === 'pending' && new Date() > transfer.expires_at) {
                await prisma.device_Key_Transfers.update({
                    where: { id: transfer_id },
                    data: { status: 'expired' },
                });
                return callback(null, { status: 'expired' });
            }

            callback(null, {
                status: transfer.status,
                wrapped_private_key: transfer.wrapped_private_key ?? '',
                approving_device_public_key: transfer.approving_device_public_key ?? '',
            });
        } catch (err) {
            logger.error('key_management.poll_transfer_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to poll transfer' });
        }
    }

    // ─── ApproveKeyTransfer ────────────────────────────────────────────────────
    // Called by the trusted (old) device after the user taps "Approve".
    // The trusted device has already done the ECDH locally and produced
    // wrapped_private_key. We just store it and flip the status.
    // ──────────────────────────────────────────────────────────────────────────
    async function ApproveKeyTransfer(call, callback) {
        try {
            const {
                transfer_id, user_id, approving_device_id,
                wrapped_private_key, approving_device_public_key,
            } = call.request;

            if (!transfer_id || !user_id || !approving_device_id || !wrapped_private_key || !approving_device_public_key) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'All fields are required',
                });
            }

            const transfer = await prisma.device_Key_Transfers.findFirst({
                where: { id: transfer_id, user_id, status: 'pending' },
            });

            if (!transfer) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'Pending transfer not found — may have expired or already been handled',
                });
            }

            if (new Date() > transfer.expires_at) {
                await prisma.device_Key_Transfers.update({
                    where: { id: transfer_id },
                    data: { status: 'expired' },
                });
                return callback({ code: grpc.status.DEADLINE_EXCEEDED, message: 'Transfer expired' });
            }

            await prisma.device_Key_Transfers.update({
                where: { id: transfer_id },
                data: {
                    status: 'approved',
                    wrapped_private_key,
                    approving_device_public_key,
                },
            });

            logger.info('key_management.transfer_approved', {
                meta: { transfer_id, user_id, approving_device_id },
            });
            callback(null, {});
        } catch (err) {
            logger.error('key_management.approve_transfer_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to approve transfer' });
        }
    }

    // ─── RejectKeyTransfer ─────────────────────────────────────────────────────
    async function RejectKeyTransfer(call, callback) {
        try {
            const { transfer_id, user_id } = call.request;
            if (!transfer_id || !user_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'transfer_id and user_id are required' });
            }

            await prisma.device_Key_Transfers.updateMany({
                where: { id: transfer_id, user_id, status: 'pending' },
                data: { status: 'rejected' },
            });

            logger.info('key_management.transfer_rejected', { meta: { transfer_id, user_id } });
            callback(null, {});
        } catch (err) {
            logger.error('key_management.reject_transfer_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to reject transfer' });
        }
    }

    // ─── ListPendingTransfers ──────────────────────────────────────────────────
    // Called by trusted devices on app open (or when they receive the FCM push).
    // Returns all pending non-expired transfer requests for this user.
    // ──────────────────────────────────────────────────────────────────────────
    async function ListPendingTransfers(call, callback) {
        try {
            const { user_id } = call.request;
            if (!user_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'user_id is required' });
            }

            const transfers = await prisma.device_Key_Transfers.findMany({
                where: {
                    user_id,
                    status: 'pending',
                    expires_at: { gt: new Date() },
                },
                orderBy: { created_at: 'desc' },
            });

            callback(null, {
                transfers: transfers.map(t => ({
                    transfer_id: t.id,
                    requesting_device_id: t.requesting_device_id,
                    ephemeral_public_key: t.ephemeral_public_key,
                    created_at: t.created_at.toISOString(),
                    expires_at: t.expires_at.toISOString(),
                })),
            });
        } catch (err) {
            logger.error('key_management.list_transfers_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to list pending transfers' });
        }
    }

    // ─── SealedKeyRecovery ─────────────────────────────────────────────────────
    // Last-resort fallback when no trusted device is available.
    // The server decrypts the sealed blob using its own key, then re-wraps
    // the plaintext private key with the new device's public key.
    // This is the only point where the server momentarily holds the plaintext key.
    // Always logged to Audit_Logs.
    // ──────────────────────────────────────────────────────────────────────────
    async function SealedKeyRecovery(call, callback) {
        try {
            const { user_id, organization_id, device_id, device_public_key } = call.request;
            if (!user_id || !organization_id || !device_id || !device_public_key) {
                return callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: 'user_id, organization_id, device_id, device_public_key are required',
                });
            }

            const sealedBackup = await prisma.server_Sealed_Key_Backups.findUnique({
                where: { user_id },
            });

            if (!sealedBackup) {
                return callback({
                    code: grpc.status.NOT_FOUND,
                    message: 'No server-sealed backup found for this user',
                });
            }

            // Decrypt with server key — plaintext exists in memory only here.
            let plaintextPrivateKey;
            try {
                plaintextPrivateKey = unsealWithRsa(sealedBackup.sealed_blob);
            } catch (decryptErr) {
                logger.error('key_management.sealed_recovery_decrypt_failed', { error: decryptErr, meta: { user_id } });
                return callback({ code: grpc.status.INTERNAL, message: 'Failed to decrypt sealed backup' });
            }

            // Re-wrap immediately for the requesting device.
            let wrappedKey;
            try {
                wrappedKey = wrapKeyForDevice(plaintextPrivateKey, device_public_key);
            } catch (wrapErr) {
                logger.error('key_management.sealed_recovery_wrap_failed', { error: wrapErr, meta: { user_id } });
                return callback({ code: grpc.status.INTERNAL, message: 'Failed to wrap key for device' });
            }

            // Explicitly clear the plaintext from memory as soon as possible.
            plaintextPrivateKey.fill(0);

            // Log for audit trail — this is mandatory.
            await prisma.audit_Logs.create({
                data: {
                    action: 'sealed_key_recovery',
                    action_performed_by: user_id,
                    action_target: device_id,
                    ip_address: call.getPeer(),
                },
            });

            logger.warn('key_management.sealed_recovery_used', { meta: { user_id, device_id } });
            callback(null, { wrapped_private_key: wrappedKey });
        } catch (err) {
            logger.error('key_management.sealed_recovery_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Sealed key recovery failed' });
        }
    }

    // ─── ListDevices ──────────────────────────────────────────────────────────
    async function ListDevices(call, callback) {
        try {
            const { user_id } = call.request;
            if (!user_id) return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'user_id is required' });

            const rows = await prisma.user_Devices.findMany({
                where: { user_id, is_active: true },
                orderBy: { last_seen: 'desc' },
            });

            callback(null, {
                devices: rows.map(d => ({
                    device_id: d.device_id,
                    platform: d.platform,
                    last_seen: d.last_seen.toISOString(),
                    is_active: d.is_active,
                })),
            });
        } catch (err) {
            logger.error('key_management.list_devices_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to list devices' });
        }
    }

    // ─── RevokeDevice ─────────────────────────────────────────────────────────
    async function RevokeDevice(call, callback) {
        try {
            const { user_id, device_id } = call.request;
            if (!user_id || !device_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'user_id and device_id are required' });
            }

            await prisma.user_Devices.updateMany({
                where: { user_id, device_id },
                data: { is_active: false },
            });

            logger.info('key_management.device_revoked', { meta: { user_id, device_id } });
            callback(null, {});
        } catch (err) {
            logger.error('key_management.revoke_device_failed', { error: err });
            callback({ code: grpc.status.INTERNAL, message: 'Failed to revoke device' });
        }
    }

    // ─── gRPC server ──────────────────────────────────────────────────────────
    const server = new grpc.Server();
    server.addService(proto.KeyManagementService.service, {
        UploadKeyBackup,
        GetKeyBackup,
        RegisterDevice,
        RequestKeyTransfer,
        PollKeyTransfer,
        ApproveKeyTransfer,
        RejectKeyTransfer,
        ListPendingTransfers,
        SealedKeyRecovery,
        ListDevices,
        RevokeDevice,
    });

    const addr = '0.0.0.0:5052';
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            logger.error('key_management.grpc.bind_failed', { error: err });
            return;
        }
        logger.info('key_management.grpc.ready', { meta: { addr, port } });
    });
}
