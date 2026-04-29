/* ==========================================================================
   BLOCK 0: DATA MODELS & CONFIG
   ========================================================================== */
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

mongoose.connect(process.env.MONGO_URI, { dbName: 'dischat_data' });

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
    room: String, sender: String, text: String, timestamp: { type: Date, default: Date.now }
}));

/* ==========================================================================
   BLOCK 1: AUTH & SEARCH LOGIC
   ========================================================================== */
io.on('connection', (socket) => {
    
    socket.on('login', async (data) => {
        const user = await User.findOne({ username: data.username });
        if (!user) return socket.emit('auth_err', "IDENTITY_NOT_FOUND");
        if (user.password !== data.password) return socket.emit('auth_err', "PASSKEY_REJECTED");
        if (!user.isApproved) return socket.emit('auth_err', "ACCESS_PENDING_APPROVAL");
        socket.emit('login_success', { username: user.username, groups: user.groups });
    });

    socket.on('register', async (data) => {
        const exists = await User.findOne({ username: data.username });
        if (exists) return socket.emit('auth_err', "ID_ALREADY_EXISTS");
        await new User({ username: data.username, password: data.password }).save();
        socket.emit('auth_err', "SUCCESS: AWAITING_APPROVAL");
    });

    socket.on('search_net', async (query) => {
        if (!query) return;
        const users = await User.find({ username: { $regex: query, $options: 'i' }, isApproved: true }).limit(5);
        const groups = await Group.find({ groupName: { $regex: query, $options: 'i' } }).sort({ isPublic: -1 }).limit(5);
        socket.emit('search_results', { users, groups });
    });

/* ==========================================================================
   BLOCK 2: GROUP & PROFILE OPS
   ========================================================================== */
    socket.on('join_cluster', async (data) => {
        const group = await Group.findOne({ roomId: data.roomId });
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

    socket.on('get_group_meta', async (rid) => {
        const g = await Group.findOne({ roomId: rid });
        if (g) socket.emit('group_meta_res', g);
    });

    socket.on('send_msg', async (p) => {
        const m = new Message(p);
        await m.save();
        io.to(p.room).emit('new_msg', m);
    });

    socket.on('join_room', (r) => {
        socket.rooms.forEach(room => socket.leave(room));
        socket.join(r);
    });
});

server.listen(3000);