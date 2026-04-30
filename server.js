// server.js - FULLY FIXED & PROFESSIONAL (May 2026)
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

mongoose.connect(process.env.MONGO_URI, { dbName: 'dischat_data' })
    .then(() => console.log(">>> [SYSTEM_CORE]: DATABASE_ONLINE"))
    .catch(err => console.error(">>> [FATAL_ERR]: DB_CONNECTION_FAILED", err));

// ====================== SCHEMAS ======================
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true, trim: true, lowercase: true },
    password: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    isVip: { type: Boolean, default: false },
    groups: [{ roomId: String, groupName: String, isDM: Boolean }]
}, { timestamps: true }));

const Group = mongoose.model('Group', new mongoose.Schema({
    roomId: { type: String, unique: true, required: true },
    groupName: { type: String, required: true, trim: true },
    isPublic: { type: Boolean, default: true },
    password: { type: String, default: "" },
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    members: [String]
}, { timestamps: true }));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String,
    roomName: String,
    sender: String,
    text: String,
    isVip: { type: Boolean, default: false },
    timestamp: { type: Date, default: Date.now }
}));

// ====================== SOCKET EVENTS ======================
io.on('connection', (socket) => {
    console.log(`[SOCKET] Client connected: ${socket.id}`);

    // AUTH
    socket.on('login', async (data) => {
        try {
            const user = await User.findOne({ username: data.username.toLowerCase() });
            if (!user) return socket.emit('auth_status', { ok: false, m: "IDENTITY_NOT_FOUND" });
            if (user.password !== data.password) return socket.emit('auth_status', { ok: false, m: "PASSKEY_REJECTED" });
            if (!user.isApproved) return socket.emit('auth_status', { ok: false, m: "ACCESS_PENDING_APPROVAL" });

            socket.data.username = user.username;
            socket.data.isVip = user.isVip;

            socket.emit('login_success', { 
                username: user.username, 
                groups: user.groups || [],
                isVip: user.isVip 
            });
        } catch (err) {
            console.error("[LOGIN_ERROR]", err);
            socket.emit('notify', { m: "LOGIN_ERROR", type: "error" });
        }
    });

    socket.on('register', async (data) => {
        try {
            const exists = await User.findOne({ username: data.username.toLowerCase() });
            if (exists) return socket.emit('auth_status', { ok: false, m: "ID_ALREADY_EXISTS" });

            await new User({ username: data.username.toLowerCase(), password: data.password }).save();
            socket.emit('auth_status', { ok: true, m: "SUCCESS: AWAITING_APPROVAL" });
        } catch (err) {
            console.error("[REGISTER_ERROR]", err);
            socket.emit('notify', { m: "REGISTRATION_FAILED", type: "error" });
        }
    });

    // GLOBAL SEARCH
    socket.on('global_search', async (query) => {
        try {
            if (!query || query.length < 2) return;

            const users = await User.find({
                username: { $regex: query, $options: 'i' },
                isApproved: true
            }).select('username isVip').limit(10);

            const groups = await Group.find({
                groupName: { $regex: query, $options: 'i' },
                $or: [{ isPublic: true }, { members: socket.data.username }]
            }).limit(10);

            socket.emit('search_results', { users, groups });
        } catch (err) {
            console.error("[GLOBAL_SEARCH_ERROR]", err);
        }
    });

    // CREATE CLUSTER
    socket.on('create_cluster', async (data) => {
        try {
            if (!socket.data.username || !data.groupName?.trim()) {
                return socket.emit('notify', { m: "GROUP_NAME_REQUIRED", type: "error" });
            }

            const roomId = "CLUSTER_" + Math.random().toString(36).substring(2, 12).toUpperCase();

            const newGroup = new Group({
                roomId,
                groupName: data.groupName.trim(),
                isPublic: !!data.isPublic,
                password: data.isPublic ? "" : (data.password || ""),
                createdBy: socket.data.username,
                members: [socket.data.username]
            });

            await newGroup.save();

            const groupRef = { roomId, groupName: data.groupName.trim(), isDM: false };

            await User.updateOne({ username: socket.data.username }, { $addToSet: { groups: groupRef } });

            socket.emit('cluster_joined', groupRef);
            socket.emit('notify', { m: `Cluster "${data.groupName}" created`, type: "success" });
        } catch (err) {
            console.error("[CREATE_CLUSTER_ERROR]", err);
            socket.emit('notify', { m: "CLUSTER_CREATION_FAILED", type: "error" });
        }
    });

    // START DM - FIXED
    socket.on('start_dm', async ({ target, roomId, roomName }) => {
        try {
            if (!socket.data.username || target === socket.data.username) return;

            const dmRef = { roomId, groupName: roomName, isDM: true };

            // Add to both users
            await User.updateOne({ username: socket.data.username }, { $addToSet: { groups: dmRef } });
            await User.updateOne({ username: target.toLowerCase(), isApproved: true }, { $addToSet: { groups: dmRef } });

            socket.join(roomId);
            socket.emit('dm_started', dmRef);

            // Notify target user if online
            for (const [_, client] of io.sockets.sockets) {
                if (client.data.username === target.toLowerCase()) {
                    client.emit('dm_started', dmRef);
                    client.join(roomId);
                    break;
                }
            }
        } catch (err) {
            console.error("[START_DM_ERROR]", err);
        }
    });

    // JOIN ROOM
    socket.on('join_room', async (roomId) => {
        try {
            if (!roomId || !socket.data.username) return;

            Array.from(socket.rooms).forEach(r => {
                if (r !== socket.id && r !== roomId && r !== 'global') socket.leave(r);
            });

            socket.join(roomId);

            const history = await Message.find({ room: roomId })
                .sort({ timestamp: 1 })
                .limit(150);

            socket.emit('chat_history', history);
        } catch (err) {
            console.error("[JOIN_ROOM_ERROR]", err);
        }
    });

    // SEND MESSAGE - FIXED with proper roomName
    socket.on('send_msg', async (p) => {
        try {
            if (!socket.data.username || !p.room || !p.text?.trim()) return;

            const user = await User.findOne({ username: socket.data.username });
            const isVip = user?.isVip || false;

            let finalRoomName = p.roomName || p.room;

            // Ensure DM shows the OTHER user's name
            if (p.room.startsWith('DM_')) {
                const parts = p.room.split('_').slice(1);
                const otherUser = parts.find(u => u !== socket.data.username);
                if (otherUser) finalRoomName = otherUser;
            }

            const msg = new Message({
                room: p.room,
                roomName: finalRoomName,
                sender: socket.data.username,
                text: p.text.trim(),
                isVip
            });

            await msg.save();

            io.to(p.room).emit('new_msg', msg);

            console.log(`[MSG] ${socket.data.username} → ${p.room}`);
        } catch (err) {
            console.error("[SEND_MSG_ERROR]", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[SOCKET] Client disconnected: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> [DISCHAT v2.9] Server running on port ${PORT}`);
});