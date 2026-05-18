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

//SCHEMAS
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
    timestamp: { type: Date, default: Date.now },
    // ADD THIS SUB-ARRAY LAYER TO STORE USER REACTIONS INTO MONGOOSE DOCUMENTS
    reactions: [{ username: String, emoji: String }] 
}));

//SOCKET EVENTS
io.on('connection', (socket) => {
    console.log(`[NET] Port opened: ${socket.id}`);

    // AUTH LAYER - INJECT CHRONO DATA RESYNC
    socket.on('login', async (data) => {
        try {
            const user = await User.findOne({ username: data.username.toLowerCase() });
            if (!user) return socket.emit('auth_status', { ok: false, m: "IDENTITY_NOT_FOUND" });
            if (user.password !== data.password) return socket.emit('auth_status', { ok: false, m: "PASSKEY_REJECTED" });
            if (!user.isApproved) return socket.emit('auth_status', { ok: false, m: "ACCESS_PENDING_APPROVAL" });

            socket.data.username = user.username;
            socket.data.isVip = user.isVip;

            socket.join('global'); 
            if (user.groups && user.groups.length > 0) {
                user.groups.forEach(g => {
                    if (g && g.roomId) socket.join(g.roomId);
                });
            }

            //TIME SEQUENCE
            const updatedGroupsWithTime = await Promise.all((user.groups || []).map(async (g) => {
                const plainGroup = g.toObject ? g.toObject() : { ...g };
                const lastMsg = await Message.findOne({ room: plainGroup.roomId })
                    .sort({ timestamp: -1 })
                    .select('text sender timestamp')
                    .lean();

                
                plainGroup.isDM = !!plainGroup.isDM;

                if (lastMsg) {
                    plainGroup.lastMsgSnippet = `${lastMsg.sender}: ${lastMsg.text}`;
                    plainGroup.lastTimestamp = new Date(lastMsg.timestamp).getTime();
                } else {
                    plainGroup.lastMsgSnippet = "No transmissions yet";
                    plainGroup.lastTimestamp = 0;
                }
                return plainGroup;
            }));
            

            socket.emit('login_success', { 
                username: user.username, 
                groups: updatedGroupsWithTime, // Transmit complete hydration objects
                isVip: user.isVip 
            });
        } catch (err) {
            console.error("[LOGIN_ERROR]", err);
            socket.emit('notify', { m: "SERVER_HANDSHAKE_ERROR", type: "error" });
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

            // Ensure the creator physically joins the socket channel
            socket.join(roomId);

            socket.emit('cluster_joined', groupRef);
            socket.emit('notify', { m: `Cluster "${data.groupName}" established`, type: "success" });
        } catch (err) {
            console.error("[CREATE_CLUSTER_ERROR]", err);
            socket.emit('notify', { m: "CLUSTER_CREATION_FAILED", type: "error" });
        }
    });
    // INVITE/ADD PERSON TO CLUSTER
    socket.on('invite_to_cluster', async ({ roomId, targetUsername }) => {
        try {
            if (!socket.data.username || !roomId || !targetUsername) return;

            const targetLower = targetUsername.trim().toLowerCase();
            
            // 1. Verify target user exists and is approved
            const targetUser = await User.findOne({ username: targetLower, isApproved: true });
            if (!targetUser) {
                return socket.emit('notify', { m: "NODE_IDENTITY_INVALID_OR_PENDING", type: "error" });
            }

            // 2. Verify the group exists
            const groupData = await Group.findOne({ roomId });
            if (!groupData) {
                return socket.emit('notify', { m: "CLUSTER_NOT_FOUND", type: "error" });
            }

            const groupRef = { roomId, groupName: groupData.groupName, isDM: false };

            // 3. Persist relations to DB simultaneously 
            await User.updateOne({ username: targetLower }, { $addToSet: { groups: groupRef } });
            await Group.updateOne({ roomId }, { $addToSet: { members: targetLower } });

            
            let targetIsOnline = false;
            for (const [_, client] of io.sockets.sockets) {
                if (client.data.username === targetLower) {
                    client.join(roomId);
                    client.emit('cluster_joined', groupRef);
                    client.emit('notify', { m: `You have been deployed into Cluster: ${groupData.groupName}`, type: "info" });
                    targetIsOnline = true;
                }
            }

            socket.emit('notify', { 
                m: `Node [${targetUsername}] spliced into stream. Status: ${targetIsOnline ? 'LIVE_SYNC' : 'DEFERRED_SYNC'}`, 
                type: "success" 
            });

        } catch (err) {
            console.error("[INVITE_TO_CLUSTER_ERROR]", err);
            socket.emit('notify', { m: "STREAM_SPLICING_FAILED", type: "error" });
        }
    });

    // START DM
    socket.on('start_dm', async ({ target, roomId, roomName }) => {
        try {
            if (!socket.data.username || target.toLowerCase() === socket.data.username.toLowerCase()) return;

             
           
            const senderRef = { roomId, groupName: target, isDM: true };
            const receiverRef = { roomId, groupName: socket.data.username, isDM: true };

            await User.updateOne({ username: socket.data.username }, { $addToSet: { groups: senderRef } });
            await User.updateOne({ username: target.toLowerCase(), isApproved: true }, { $addToSet: { groups: receiverRef } });

            // Subscribe initiator immediately
            socket.join(roomId);
            socket.emit('dm_started', { ...senderRef, initiatedByMe: true });

            // If the target node is online, forcibly add them to the new channel
            for (const [_, client] of io.sockets.sockets) {
                if (client.data.username === target.toLowerCase()) {
                    client.join(roomId);
                    // Pass initiatedByMe: false so their client doesn't yank their screen to the new DM
                    client.emit('dm_started', { ...receiverRef, initiatedByMe: false });
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

        
        socket.join(roomId);

        
        if (roomId.startsWith('CLUSTER_')) {
            const groupData = await Group.findOne({ roomId });
            if (groupData) {
                const groupRef = { 
                    roomId: groupData.roomId, 
                    groupName: groupData.groupName, 
                    isDM: false 
                };
                // Add to User's group list and Group's member list simultaneously
                await User.updateOne({ username: socket.data.username }, { $addToSet: { groups: groupRef } });
                await Group.updateOne({ roomId }, { $addToSet: { members: socket.data.username } });
            }
        }

        // 3. Fetch History
        const history = await Message.find({ room: roomId })
            .sort({ timestamp: 1 })
            .limit(150);

        socket.emit('chat_history', history);
    } catch (err) {
        console.error("[JOIN_ROOM_ERROR]", err);
    }
});

    // SEND MESSAGE 
    socket.on('send_msg', async (p) => {
        try {
            if (!socket.data.username || !p.room || !p.text?.trim()) return;

            const user = await User.findOne({ username: socket.data.username });
            const isVip = user?.isVip || false;

            let finalRoomName = p.roomName || p.room;

            if (p.room.startsWith('DM_')) {
                const parts = p.room.split('_').slice(1);
                const otherUser = parts.find(u => u.toLowerCase() !== socket.data.username.toLowerCase());
                if (otherUser) finalRoomName = otherUser;
            }

            const msg = new Message({
                room: p.room,
                roomName: finalRoomName,
                sender: socket.data.username,
                text: p.text.trim(),
                isVip,
                
                timestamp: new Date() 
            });

            await msg.save();

            
            io.to(p.room).emit('new_msg', msg);

        } catch (err) {
            console.error("[SEND_MSG_ERROR]", err);
        }
    });
    
    socket.on('message_reaction', async ({ msgId, emoji }) => {
        try {
            if (!socket.data.username || !msgId || !emoji) return;

            const username = socket.data.username.toLowerCase();

            // Fetch the target message document from  collection
            const msg = await Message.findById(msgId);
            if (!msg) return;

            //Locate ANY existing reaction previously left by this user on this message
            const pastReactionIndex = msg.reactions.findIndex(
                r => r.username.toLowerCase() === username
            );

            if (pastReactionIndex > -1) {
                const pastReaction = msg.reactions[pastReactionIndex];
                
                // If they clicked the EXACT same emoji again, treat it as a toggle OFF (remove it)
                if (pastReaction.emoji === emoji) {
                    msg.reactions.splice(pastReactionIndex, 1);
                } else {
                    // If they clicked a DIFFERENT emoji, swap it! Update their choice inline.
                    msg.reactions[pastReactionIndex].emoji = emoji;
                }
            } else {
                // If they have no prior history on this message, safely push their new reaction mapping
                msg.reactions.push({ username, emoji });
            }

            await msg.save();

            // Broad-scale emit layout signals outwards to everyone tuned into the active pipeline
            io.to(msg.room).emit('reaction_updated', { msgId, reactions: msg.reactions });

        } catch (err) {
            console.error("[MESSAGE_REACTION_ERROR]", err);
        }
    });

    socket.on('disconnect', () => {
        console.log(`[NET] Port closed: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> [DISCHAT_CORE_v3.0] Server initialized on port ${PORT}`);
});