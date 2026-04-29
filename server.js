require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI, { dbName: 'dischat_data' })
    .then(() => console.log(">>> [SYSTEM_CORE]: DATABASE_ONLINE"))
    .catch(err => console.error(">>> [FATAL_ERR]: DB_CONNECTION_FAILED", err));

// --- DATA SCHEMAS ---
const User = mongoose.model('User', new mongoose.Schema({
    username: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    isApproved: { type: Boolean, default: false },
    groups: [{ roomId: String, groupName: String, isDM: Boolean }]
}));

const Group = mongoose.model('Group', new mongoose.Schema({
    roomId: { type: String, unique: true },
    groupName: String,
    isPublic: { type: Boolean, default: true },
    password: { type: String, default: "" },
    createdBy: String,
    createdAt: { type: Date, default: Date.now },
    members: [String] 
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, roomName: String, sender: String, text: String, timestamp: { type: Date, default: Date.now }
}));

// --- SOCKET ENGINE ---
io.on('connection', (socket) => {
    
    // 1. AUTHENTICATION
    socket.on('login', async (data) => {
        const user = await User.findOne({ username: data.username });
        if (!user) return socket.emit('auth_status', { ok: false, m: "IDENTITY_NOT_FOUND" });
        if (user.password !== data.password) return socket.emit('auth_status', { ok: false, m: "PASSKEY_REJECTED" });
        if (!user.isApproved) return socket.emit('auth_status', { ok: false, m: "ACCESS_PENDING_APPROVAL" });
        
        socket.emit('login_success', { username: user.username, groups: user.groups });
    });

    socket.on('register', async (data) => {
        const exists = await User.findOne({ username: data.username });
        if (exists) return socket.emit('auth_status', { ok: false, m: "ID_ALREADY_EXISTS" });
        
        await new User({ username: data.username, password: data.password }).save();
        socket.emit('auth_status', { ok: true, m: "SUCCESS: AWAITING_APPROVAL" });
    });

    // 2. SEARCH & DISCOVERY (Synchronized Event Name)
    socket.on('global_search', async (query) => {
        if (!query) return;
        const users = await User.find({ username: { $regex: query, $options: 'i' }, isApproved: true }).limit(5);
        const groups = await Group.find({ groupName: { $regex: query, $options: 'i' } }).sort({ isPublic: -1 }).limit(5);
        socket.emit('search_results', { users, groups });
    });

    // 3. CLUSTER CREATION
    socket.on('create_cluster', async (data) => {
        const roomId = "CLUSTER_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        const newGroup = new Group({
            roomId, groupName: data.groupName, isPublic: data.isPublic,
            password: data.password || "", createdBy: data.creator, members: [data.creator]
        });
        await newGroup.save();
        
        const groupRef = { roomId, groupName: data.groupName, isDM: false };
        await User.updateOne({ username: data.creator }, { $addToSet: { groups: groupRef } });
        socket.emit('cluster_joined', groupRef);
    });

    // 4. CLUSTER JOINING LOGIC
    socket.on('join_cluster', async (data) => {
        const group = await Group.findOne({ roomId: data.roomId });
        if (!group) return socket.emit('notify', { m: "CLUSTER_NOT_FOUND", type: "error" });

        const user = await User.findOne({ username: data.username });
        const isMember = user.groups.some(g => g.roomId === data.roomId);

        if (!isMember && !group.isPublic && group.password !== data.password) {
            return socket.emit('notify', { m: "INVALID_PASSKEY", type: "error" });
        }

        const groupRef = { roomId: group.roomId, groupName: group.groupName, isDM: false };
        await User.updateOne({ username: data.username }, { $addToSet: { groups: groupRef } });
        await Group.updateOne({ roomId: group.roomId }, { $addToSet: { members: data.username } });
        socket.emit('cluster_joined', groupRef);
    });

    // 5. CHAT ENGINE (Strict Room Segregation)
    socket.on('join_room', async (r) => {
        // Leave all current rooms except the user's private socket ID
        socket.rooms.forEach(room => { if(room !== socket.id) socket.leave(room); });
        socket.join(r);
        
        const history = await Message.find({ room: r }).sort({ timestamp: 1 }).limit(50);
        socket.emit('chat_history', history);
    });

    socket.on('send_msg', async (p) => {
        const m = new Message(p);
        await m.save();
        io.to(p.room).emit('new_msg', m);
    });

    socket.on('get_group_meta', async (rid) => {
        const g = await Group.findOne({ roomId: rid });
        if (g) socket.emit('group_meta_res', g);
    });
});

server.listen(3000, () => console.log('>>> [STABLE_SERVER_PORT_3000]'));