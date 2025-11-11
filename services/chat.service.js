import path, { dirname } from 'path';
import { fileURLToPath } from 'url';
import grpc from '@grpc/grpc-js';
import protoLoader from '@grpc/proto-loader';

// Helper to get __dirname in ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export function startChatService(prisma, redisPublisher, redisSubscriber, firebaseAdmin) {
    console.log("🚀 Initializing Chat Service...");

    const protoPath = path.join(__dirname, '../grpc/chat.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
    });
    const proto = grpc.loadPackageDefinition(packageDefinition).chat;

    const clients = new Map(); // key: 'orgId:userId', value: gRPC call stream
    const activeConversations = new Map(); // key: 'orgId:userId', value: 'activeChatWithId'

    // =========================================================
    // =============== gRPC Method Implementations ===============
    // =========================================================

    /**
     * @param {grpc.ServerUnaryCall} call
     * @param {grpc.sendUnaryData} callback
     */
    async function SendMessage(call, callback) {
        try {
            // In a real app, you would get sender_id & organization_id from authenticated metadata
            const data = call.request;

            // 1. Validation
            if (!data.sender_id || !data.receiver_id || !data.organization_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'sender_id, receiver_id, and organization_id are required' });
            }
            if (!data.encrypted_message || !data.encrypted_sym_key) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'encrypted_message and encrypted_sym_key are required' });
            }

            // 2. Persist to DB
            const message = await prisma.chat_Messages.create({
                data: {
                    sender_id: data.sender_id,
                    receiver_id: data.receiver_id,
                    organization_id: data.organization_id,
                    encrypted_message: data.encrypted_message,
                    encrypted_sym_key: data.encrypted_sym_key,
                    status: 'sent',
                },
            });

            // 3. Publish to Redis for real-time delivery
            const channel = `org:${data.organization_id}:user:${data.receiver_id}`;
            await redisPublisher.publish(channel, JSON.stringify({
                ...message,
                sent_at: message.sent_at.toISOString(),
            }));

            // 4. Send Push Notification if receiver is not actively chatting with sender
            const receiverKey = `${data.organization_id}:${data.receiver_id}`;
            const isChattingWithSender = activeConversations.get(receiverKey) === data.sender_id;

            if (!isChattingWithSender && data.sender_id !== data.receiver_id) {
                const sender = await prisma.users.findUnique({
                    where: { user_id: data.sender_id },
                    select: { first_name: true, last_name: true, e2ee_public_key: true },
                });

                if (sender) {
                    const title = `${sender.first_name} ${sender.last_name}`;
                    await sendNotification(
                        data.receiver_id,
                        title,
                        data.encrypted_message, {
                        organizationId: data.organization_id,
                        senderId: data.sender_id,
                        chatPartnerId: data.sender_id,
                        messageId: message.id,
                        peerPublicKey: sender.e2ee_public_key ?? '',
                    }
                    );
                }
            }

            callback(null, {});
        } catch (err) {
            console.error('❌ SendMessage error:', err);
            callback({ code: grpc.status.INTERNAL, message: 'Failed to send message' });
        }
    }

    /**
     * @param {grpc.ServerWritableStream} call
     */
    async function ReceiveMessages(call) {
        try {
            const { userId, organization_id } = call.request;
            if (!userId || !organization_id) {
                call.emit('error', { code: grpc.status.INVALID_ARGUMENT, message: 'userId and organization_id are required' });
                return;
            }

            const messages = await prisma.chat_Messages.findMany({
                where: {
                    organization_id: organization_id,
                    OR: [
                        { sender_id: userId, deleted_by_sender: false },
                        { receiver_id: userId, deleted_by_receiver: false },
                    ],
                },
                orderBy: { sent_at: 'asc' },
            });

            for (const msg of messages) {
                call.write({
                    ...msg,
                    sent_at: msg.sent_at.toISOString()
                });
            }
        } catch (err) {
            console.error(`❌ ReceiveMessages error for user ${call.request.userId}:`, err);
            call.emit('error', { code: grpc.status.INTERNAL, message: 'Failed to retrieve messages' });
        } finally {
            call.end();
        }
    }

    /**
     * @param {grpc.ServerUnaryCall} call
     * @param {grpc.sendUnaryData} callback
     */
    async function UpdateMessageStatus(call, callback) {
        try {
            const { messageId, status, organization_id } = call.request;
            if (!messageId || !status || !organization_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'messageId, status, and organization_id are required' });
            }

            const updateData = { status };
            if (status === 'read') {
                updateData.read_at = new Date();
            }

            const updatedMsg = await prisma.chat_Messages.update({
                where: { id: messageId, organization_id: organization_id },
                data: updateData,
            });

            // Notify the original sender that the message status has changed
            const senderChannel = `org:${organization_id}:user:${updatedMsg.sender_id}`;
            await redisPublisher.publish(senderChannel, JSON.stringify({
                ...updatedMsg,
                sent_at: updatedMsg.sent_at.toISOString(),
            }));

            callback(null, {});
        } catch (err) {
            console.error('❌ UpdateMessageStatus error:', err);
            callback({ code: grpc.status.INTERNAL, message: 'Failed to update status' });
        }
    }

    /**
     * @param {grpc.ServerUnaryCall} call
     * @param {grpc.sendUnaryData} callback
     */
    async function GetContacts(call, callback) {
        try {
            const { userId, organization_id } = call.request;
            if (!userId || !organization_id) {
                return callback({ code: grpc.status.INVALID_ARGUMENT, message: 'userId and organization_id are required' });
            }

            const messages = await prisma.chat_Messages.findMany({
                where: {
                    organization_id,
                    OR: [{ sender_id: userId }, { receiver_id: userId }],
                },
                orderBy: { sent_at: 'desc' },
                distinct: ['sender_id', 'receiver_id'],
            });

            const contactMap = new Map();
            for (const msg of messages) {
                const otherUserId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
                if (!contactMap.has(otherUserId)) {
                    contactMap.set(otherUserId, {
                        last_message_encrypted: msg.encrypted_message,
                        sent_at: msg.sent_at.toISOString(),
                    });
                }
            }

            const contactIds = Array.from(contactMap.keys());
            const users = await prisma.users.findMany({
                where: { user_id: { in: contactIds } },
                select: { user_id: true, first_name: true, last_name: true },
            });

            let contacts = users.map(user => ({
                id: user.user_id,
                first_name: user.first_name,
                last_name: user.last_name,
                ...contactMap.get(user.user_id),
            }));

            contacts.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

            callback(null, { contacts });
        } catch (err) {
            console.error('❌ GetContacts error:', err);
            callback({ code: grpc.status.INTERNAL, message: 'Failed to get contacts' });
        }
    }

    /**
     * @param {grpc.ServerDuplexStream} call
     */
    function ChatStream(call) {
        let streamMetadata = { userId: null, orgId: null, clientKey: null };
        const sub = redisSubscriber.duplicate();

        call.on('data', async (clientEvent) => {
            if (clientEvent.heartbeat) {
                const { userId, organization_id, activeChatWith } = clientEvent.heartbeat;
                if (!userId || !organization_id) return;

                const clientKey = `${organization_id}:${userId}`;

                // If it's the first heartbeat for this stream, set up the subscription
                if (!streamMetadata.clientKey) {
                    streamMetadata = { userId, orgId: organization_id, clientKey };
                    clients.set(clientKey, call);

                    try {
                        await sub.connect();
                        const channel = `org:${organization_id}:user:${userId}`;

                        await sub.subscribe(channel, async (messageStr) => {
                            const message = JSON.parse(messageStr);

                            // Mark as "delivered" if receiver is in the chat screen with the sender
                            const isChatting = activeConversations.get(clientKey) === message.sender_id;
                            if (message.status === 'sent' && isChatting) {
                                try {
                                    await prisma.chat_Messages.update({
                                        where: { id: message.id },
                                        data: { status: 'delivered' },
                                    });
                                    message.status = 'delivered';
                                } catch (updateErr) { console.error('Failed to mark as delivered:', updateErr); }
                            }

                            if (clients.has(clientKey)) {
                                clients.get(clientKey).write({ message });
                            }
                        });

                    } catch (subErr) {
                        console.error(`❌ Redis subscription failed for ${clientKey}:`, subErr);
                        cleanup();
                    }
                }

                // Update active conversation status on every heartbeat
                if (activeChatWith) {
                    activeConversations.set(clientKey, activeChatWith);
                } else {
                    activeConversations.delete(clientKey);
                }
            }
        });

        const cleanup = async () => {
            const { clientKey } = streamMetadata;
            if (clientKey) {
                clients.delete(clientKey);
                activeConversations.delete(clientKey);
                console.log(`🔴 Cleaned up stream for client: ${clientKey}`);
            }
            if (sub.isOpen) {
                await sub.quit();
            }
            if (!call.writableEnded) {
                call.end();
            }
        };

        call.on('end', cleanup);
        call.on('error', (err) => {
            console.warn(`Stream error for ${streamMetadata.clientKey}: ${err.message}`);
            cleanup();
        });
    }

    // =========================================================
    // =================== Helper Functions ====================
    // =========================================================
    async function sendNotification(userId, title, encryptedContent, dataPayload = {}) {
        try {
            const user = await prisma.users.findUnique({
                where: { user_id: userId },
                select: { fcm_token: true },
            });

            if (!user?.fcm_token) {
                console.warn(`⚠️ No FCM token for user ${userId}`);
                return;
            }

            const message = {
                token: user.fcm_token,
                notification: { title, body: "You have a new message" },
                data: {
                    ...dataPayload,
                    userId: String(userId),
                    cipher: encryptedContent,
                },
            };

            await firebaseAdmin.messaging().send(message);
            console.log(`📲 Notification sent to user ${userId}`);
        } catch (err) {
            console.error(`❌ Failed to send notification to ${userId}:`, err);
        }
    }


    // =========================================================
    // =================== gRPC Server Setup ===================
    // =========================================================
    const server = new grpc.Server();
    server.addService(proto.ChatService.service, {
        SendMessage,
        ReceiveMessages,
        UpdateMessageStatus,
        ChatStream,
        GetContacts,
    });

    const addr = '0.0.0.0:5050';
    server.bindAsync(addr, grpc.ServerCredentials.createInsecure(), (err, port) => {
        if (err) {
            console.error("❌ gRPC bind error:", err);
            return;
        }
        console.log(`🟢 gRPC Chat Service running at ${addr}`);
    });
}
