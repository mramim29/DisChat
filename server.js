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
    .then(() => console.log(">>> [SYSTEM]: NEURAL_LINK_STABILIZED"))
    .catch(err => console.error(">>> [FATAL]: DATABASE_OFFLINE", err));

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
    members: [String]
}));

const Message = mongoose.model('Message', new mongoose.Schema({
    room: String, sender: String, text: String, timestamp: { type: Date, default: Date.now }
}));

// --- SOCKET ENGINE ---
io.on('connection', (socket) => {
    let sessionUser = null;

    socket.on('login', async (data) => {
        const user = await User.findOne({ username: data.username, password: data.password });
        if (user && user.isApproved) {
            sessionUser = user.username;
            socket.emit('login_success', { username: user.username, groups: user.groups });
        } else {
            socket.emit('auth_status', { ok: false, m: 'ACCESS_DENIED: INVALID_CREDENTIALS' });
        }
    });

    socket.on('join_room', async (roomId) => {
        // Strict Room Partitioning: Leave all other rooms first
        socket.rooms.forEach(room => { if(room !== socket.id) socket.leave(room); });
        
        socket.join(roomId);
        const history = await Message.find({ room: roomId }).sort({ timestamp: 1 }).limit(50);
        socket.emit('chat_history', history);
    });

    socket.on('send_msg', async (payload) => {
        const { room, text, sender } = payload;
        if (!room || !text) return;

        const newMsg = new Message({ room, sender, text });
        await newMsg.save();
        
        // Target specific room only
        io.to(room).emit('new_msg', { room, sender, text, timestamp: newMsg.timestamp });
    });

    socket.on('create_group', async (data) => {
        const roomId = "CLUSTER_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        const newGroup = new Group({
            roomId,
            groupName: data.groupName,
            isPublic: data.isPublic,
            password: data.password || "",
            members: [data.creator]
        });

        await newGroup.save();
        
        const groupRef = { roomId, groupName: data.groupName, isDM: false };
        await User.updateOne({ username: data.creator }, { $addToSet: { groups: groupRef } });
        
        socket.emit('join_cluster_res', { ok: true, payload: groupRef });
    });

    socket.on('join_private_cluster', async (data) => {
        const cleanId = data.roomId.includes('CLUSTER_') ? data.roomId : `CLUSTER_${data.roomId}`;
        const cluster = await Group.findOne({ roomId: cleanId });

        if (!cluster) return socket.emit('join_cluster_res', { ok: false, m: 'NOT_FOUND' });
        if (!cluster.isPublic && cluster.password !== data.password) {
            return socket.emit('join_cluster_res', { ok: false, m: 'INVALID_PASSKEY' });
        }

        const groupRef = { roomId: cluster.roomId, groupName: cluster.groupName, isDM: false };
        await User.updateOne({ username: data.username }, { $addToSet: { groups: groupRef } });
        await Group.updateOne({ roomId: cluster.roomId }, { $addToSet: { members: data.username } });

        socket.emit('join_cluster_res', { ok: true, payload: groupRef });
    });

    socket.on('get_cluster_info', async (roomId) => {
        const cluster = await Group.findOne({ roomId });
        if (cluster) socket.emit('cluster_info_res', cluster);
    });
});

server.listen(3000, () => console.log('>>> [LINK_ACTIVE]'));