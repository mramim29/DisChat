/* ==========================================================================
   BLOCK 0: CONFIG & SCHEMAS
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

mongoose.connect(process.env.MONGO_URI, { dbName: 'dischat_data' })
    .then(() => console.log(">>> [SYSTEM]: NEURAL_LINK_STABILIZED"))
    .catch(err => console.error(">>> [FATAL]: DATABASE_OFFLINE", err));

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
   BLOCK 1: AUTH & NOTIFICATION ENGINE
   ========================================================================== */
io.on('connection', (socket) => {
    
    socket.on('register', async (data) => {
        const exists = await User.findOne({ username: data.username });
        if (exists) return socket.emit('notify', { type: 'error', m: 'ID_TAKEN' });
        
        await new User({ username: data.username, password: data.password }).save();
        socket.emit('notify', { type: 'success', m: 'REGISTRATION_COMPLETE: AWAITING_APPROVAL' });
    });

    socket.on('login', async (data) => {
        const user = await User.findOne({ username: data.username });
        if (!user) return socket.emit('notify', { type: 'error', m: 'IDENTITY_NOT_FOUND' });
        if (user.password !== data.password) return socket.emit('notify', { type: 'error', m: 'PASSKEY_REJECTED' });
        if (!user.isApproved) return socket.emit('notify', { type: 'error', m: 'ACCOUNT_NOT_APPROVED' });
        
        socket.emit('login_success', { username: user.username, groups: user.groups });
    });

/* ==========================================================================
   BLOCK 2: DYNAMIC SEARCH & GROUP SUGGESTIONS
   ========================================================================== */
    socket.on('search_query', async (query) => {
        if (!query) return;
        // Find public groups first, then private
        const groups = await Group.find({ groupName: { $regex: query, $options: 'i' } })
                                 .sort({ isPublic: -1 }).limit(6);
        const users = await User.find({ username: { $regex: query, $options: 'i' }, isApproved: true }).limit(4);
        socket.emit('search_results', { groups, users });
    });

    socket.on('create_group', async (data) => {
        const roomId = "CLUSTER_" + Math.random().toString(36).substring(2, 9).toUpperCase();
        const newGroup = new Group({
            roomId, groupName: data.groupName, isPublic: data.isPublic,
            password: data.password || "", createdBy: data.creator, members: [data.creator]
        });
        await newGroup.save();
        
        const groupRef = { roomId, groupName: data.groupName, isDM: false };
        await User.updateOne({ username: data.creator }, { $addToSet: { groups: groupRef } });
        socket.emit('join_success', groupRef);
    });

/* ==========================================================================
   BLOCK 3: CHAT & NOTIFICATIONS
   ========================================================================== */
    socket.on('join_room', async (roomId) => {
        socket.rooms.forEach(r => { if(r !== socket.id) socket.leave(r); });
        socket.join(roomId);
        const history = await Message.find({ room: roomId }).sort({ timestamp: 1 }).limit(50);
        socket.emit('chat_history', history);
    });

    socket.on('send_msg', async (payload) => {
        const msg = new Message(payload);
        await msg.save();
        io.to(payload.room).emit('new_msg', msg);
        // Broadcast notification to the room (excluding sender)
        socket.to(payload.room).emit('notify_msg', { 
            from: payload.sender, 
            roomName: payload.roomName || "CHANNEL" 
        });
    });

    socket.on('get_group_profile', async (roomId) => {
        const g = await Group.findOne({ roomId });
        if(g) socket.emit('group_profile_res', g);
    });
});

server.listen(3000, () => console.log('>>> [STABLE_LINK_ACTIVE]'));