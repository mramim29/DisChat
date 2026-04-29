// server.js
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" },
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(express.static('public'));

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI, { dbName: 'dischat_data' })
    .then(() => console.log(">>> [SYSTEM_CORE]: DATABASE_ONLINE"))
    .catch(err => console.error(">>> [FATAL_ERR]: DB_CONNECTION_FAILED", err));

// Schemas
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, trim: true },
    password: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    groups: [{ roomId: String, groupName: String, isDM: Boolean }]
});

const GroupSchema = new mongoose.Schema({
    roomId: { type: String, unique: true, required: true },
    groupName: { type: String, required: true, trim: true },
    isPublic: { type: Boolean, default: true },
    password: { type: String, default: "" },
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    members: [{ type: String, ref: 'User' }]
});

const MessageSchema = new mongoose.Schema({
    room: String,
    roomName: String,
    sender: String,
    text: String,
    timestamp: { type: Date, default: Date.now }
});

const User = mongoose.model('User', UserSchema);
const Group = mongoose.model('Group', GroupSchema);
const Message = mongoose.model('Message', MessageSchema);

// Socket.IO Logic
io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // ====================== AUTH ======================
    socket.on('login', async (data) => {
        try {
            if (!data?.username || !data?.password) {
                return socket.emit('auth_status', { ok: false, m: "INVALID_CREDENTIALS" });
            }

            const user = await User.findOne({ username: data.username });
            if (!user) return socket.emit('auth_status', { ok: false, m: "IDENTITY_NOT_FOUND" });
            if (user.password !== data.password) return socket.emit('auth_status', { ok: false, m: "PASSKEY_REJECTED" });
            if (!user.isApproved) return socket.emit('auth_status', { ok: false, m: "ACCESS_PENDING_APPROVAL" });

            socket.data.username = user.username; // Store in socket for later use

            socket.emit('login_success', {
                username: user.username,
                groups: user.groups || []
            });
        } catch (err) {
            console.error("Login error:", err);
            socket.emit('notify', { m: "SERVER_ERROR_DURING_LOGIN", type: "error" });
        }
    });

    socket.on('register', async (data) => {
        try {
            if (!data?.username || !data?.password) {
                return socket.emit('auth_status', { ok: false, m: "MISSING_FIELDS" });
            }

            const exists = await User.findOne({ username: data.username });
            if (exists) return socket.emit('auth_status', { ok: false, m: "ID_ALREADY_EXISTS" });

            await new User({ username: data.username, password: data.password }).save();
            socket.emit('auth_status', { ok: true, m: "SUCCESS: AWAITING_APPROVAL" });
        } catch (err) {
            console.error("Register error:", err);
            socket.emit('notify', { m: "REGISTRATION_FAILED", type: "error" });
        }
    });

    // ====================== SEARCH ======================
    socket.on('global_search', async (query) => {
        try {
            if (!query || typeof query !== 'string') return;

            const users = await User.find({
                username: { $regex: query, $options: 'i' },
                isApproved: true
            }).select('username').limit(8);

            const groups = await Group.find({
                groupName: { $regex: query, $options: 'i' }
            }).sort({ isPublic: -1 }).limit(8);

            socket.emit('search_results', { users, groups });
        } catch (err) {
            console.error("Search error:", err);
        }
    });

    // ====================== CLUSTER MANAGEMENT ======================
    socket.on('create_cluster', async (data) => {
        try {
            if (!socket.data?.username) return socket.emit('notify', { m: "NOT_AUTHENTICATED", type: "error" });

            const roomId = `CLUSTER_${Math.random().toString(36).substring(2, 10).toUpperCase()}`;

            const newGroup = new Group({
                roomId,
                groupName: data.groupName,
                isPublic: !!data.isPublic,
                password: data.password || "",
                createdBy: socket.data.username,
                members: [socket.data.username]
            });

            await newGroup.save();

            const groupRef = { roomId, groupName: data.groupName, isDM: false };

            await User.updateOne(
                { username: socket.data.username },
                { $addToSet: { groups: groupRef } }
            );

            socket.emit('cluster_joined', groupRef);
        } catch (err) {
            console.error("Create cluster error:", err);
            socket.emit('notify', { m: "CLUSTER_CREATION_FAILED", type: "error" });
        }
    });

    socket.on('join_cluster', async (data) => {
        try {
            if (!socket.data?.username) return;

            const group = await Group.findOne({ roomId: data.roomId });
            if (!group) return socket.emit('notify', { m: "CLUSTER_NOT_FOUND", type: "error" });

            const isMember = group.members.includes(socket.data.username);

            if (!isMember && !group.isPublic && group.password !== (data.password || "")) {
                return socket.emit('notify', { m: "INVALID_PASSKEY", type: "error" });
            }

            const groupRef = { roomId: group.roomId, groupName: group.groupName, isDM: false };

            await User.updateOne(
                { username: socket.data.username },
                { $addToSet: { groups: groupRef } }
            );

            await Group.updateOne(
                { roomId: group.roomId },
                { $addToSet: { members: socket.data.username } }
            );

            socket.emit('cluster_joined', groupRef);
        } catch (err) {
            console.error("Join cluster error:", err);
            socket.emit('notify', { m: "JOIN_FAILED", type: "error" });
        }
    });

    // ====================== CHAT ENGINE ======================
    socket.on('join_room', async (roomId) => {
        try {
            // Safe room leaving - convert to array first
            const currentRooms = Array.from(socket.rooms);
            currentRooms.forEach(r => {
                if (r !== socket.id) socket.leave(r);
            });

            socket.join(roomId);

            const history = await Message.find({ room: roomId })
                .sort({ timestamp: 1 })
                .limit(100);

            socket.emit('chat_history', history);
        } catch (err) {
            console.error("Join room error:", err);
            socket.emit('notify', { m: "FAILED_TO_JOIN_ROOM", type: "error" });
        }
    });

    socket.on('send_msg', async (payload) => {
        try {
            if (!socket.data?.username || !payload?.room || !payload?.text?.trim()) return;

            const message = new Message({
                room: payload.room,
                roomName: payload.roomName || payload.room,
                sender: socket.data.username,
                text: payload.text.trim()
            });

            await message.save();

            // Broadcast to room
            io.to(payload.room).emit('new_msg', message);
        } catch (err) {
            console.error("Send message error:", err);
            socket.emit('notify', { m: "MESSAGE_DELIVERY_FAILED", type: "error" });
        }
    });

    socket.on('get_group_meta', async (roomId) => {
        try {
            const group = await Group.findOne({ roomId });
            if (group) socket.emit('group_meta_res', group);
        } catch (err) {
            console.error("Get group meta error:", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
});

server.listen(3000, () => {
    console.log('>>> [STABLE_SERVER_PORT_3000] DISCHAT_OS v2.0 ONLINE');
});