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
app.use(express.json());

function escapeRegex(str) {
    if (!str) return "";
    return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
}

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

const PushSubscription = mongoose.model('PushSubscription', new mongoose.Schema({
    username: { type: String, required: true, lowercase: true },
    subscription: { type: Object, required: true }
}));

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
    
    //DELIVERY & READ RECEIPTS
    delivered: [{ type: String, lowercase: true }], 
    read: [{ type: String, lowercase: true }],      
    
    reactions: [{ username: String, emoji: String }],
    replyTo: {
        msgId: String,
        sender: String,
        text: String
    },
    type: { type: String, default: "TEXT" },
    matchId: String
}));

const Match = mongoose.model('Match', new mongoose.Schema({
    roomId: String,
    playerX: String,
    playerO: String,
    board: { type: Array, default: Array(9).fill("") },
    turn: { type: String, default: "X" },
    status: { type: String, default: "ACTIVE" }, // "ACTIVE", "WON", "DRAW", "TIMEOUT"
    winner: { type: String, default: "" }
}, { timestamps: true }));

async function notifyOfflineUser(targetUsername, senderName, messageText) {
    try {
        const subRecord = await PushSubscription.findOne({ username: targetUsername.toLowerCase() });
        if (!subRecord) return; // Target user hasn't registered a device for push, exit out

        const payload = JSON.stringify({
            title: `from ${senderName}`,
            body: messageText
        });

        await webpush.sendNotification(subRecord.subscription, payload);
    } catch (error) {
        if (error.statusCode === 410) {
            // The push service states the token expired or uninstalled -> clean up DB
            await PushSubscription.deleteOne({ username: targetUsername.toLowerCase() });
        } else {
            console.error("Web-Push delivery exception:", error);
        }
    }
}
//ONLINE USERS TRACKER 
const onlineUsers = new Map();
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

            socket.data.username = user.username.toLowerCase();
            socket.data.isVip = user.isVip;
        // ADD TO ONLINE TRACKER
        onlineUsers.set(socket.data.username, socket.id);
        console.log(`[PRESENCE] ${socket.data.username} is now ONLINE (${onlineUsers.size} total)`);

        // Broadcast to all rooms this user is in
        if (user.groups && user.groups.length > 0) {
            const roomIds = user.groups.map(g => g.roomId);
            roomIds.forEach(roomId => {
                io.to(roomId).emit('user_status', {
                    username: socket.data.username,
                    status: 'online',
                    roomId: roomId
                });
            });
        }

            socket.join('global'); 
            if (user.groups && user.groups.length > 0) {
                user.groups.forEach(g => {
                    if (g && g.roomId) socket.join(g.roomId);
                });
            }
            socket.join(`user:${socket.data.username}`);

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
        
        const safeQuery = escapeRegex(query); // FIX: Intercept raw injection strings

        const users = await User.find({
            username: { $regex: safeQuery, $options: 'i' }, // Use safe wrapper string
            isApproved: true
        }).select('username isVip').limit(10);

        const groups = await Group.find({
            groupName: { $regex: safeQuery, $options: 'i' }, // Use safe wrapper string
            $or: [{ isPublic: true }, { members: socket.data.username }]
        }).limit(10);

        socket.emit('search_results', { users, groups });
    } catch (err) {
        console.error("[GLOBAL_SEARCH_ERROR]", err);
    }
});
    //SEARCH ONLY MEMBERS WITHIN THE CURRENT CLUSTER
    socket.on('cluster_member_search', async ({ roomId, query }) => {
    try {
        if (!socket.data.username || !roomId || !query || query.length < 2) return;
        const safeQuery = escapeRegex(query);

        const cluster = await Group.findOne({ roomId, members: socket.data.username });
        if (!cluster) return;

        const matchedUsers = await User.find({
            username: { $in: cluster.members, $regex: safeQuery, $options: 'i' },
            isApproved: true
        }).select('username isVip').limit(10);

        socket.emit('ttt_duel_search_results', { users: matchedUsers });
    } catch (err) {
        console.error("[CLUSTER_MEMBER_SEARCH_ERROR]", err);
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

            
            socket.join(roomId);

            socket.emit('cluster_joined', groupRef);
            socket.emit('notify', { m: `Cluster "${data.groupName}" established`, type: "success" });

            // AUTOMATED PIPELINE RECONSTRUCTION: Dispatch Group Creation System Event Message
            const systemNotice = new Message({
                room: roomId,
                roomName: data.groupName.trim(),
                sender: "SYSTEM",
                text: `${socket.data.username.toUpperCase()} ESTABLISHED THIS CLUSTER ENCLAVE.`,
                isVip: false,
                timestamp: new Date()
            });
            await systemNotice.save();
            
            // Broadcast the notice to the room
            io.to(roomId).emit('new_msg', systemNotice);

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
        
        const targetUser = await User.findOne({ username: targetLower, isApproved: true });
        if (!targetUser) {
            return socket.emit('notify', { m: "NODE_IDENTITY_INVALID_OR_PENDING", type: "error" });
        }

        const groupData = await Group.findOne({ roomId, members: socket.data.username });
        if (!groupData) {
            return socket.emit('notify', { m: "CLUSTER_NOT_FOUND_OR_UNAUTHORIZED", type: "error" });
        }

        const groupRef = { roomId, groupName: groupData.groupName, isDM: false };

        await User.updateOne({ username: targetLower }, { $addToSet: { groups: groupRef } });
        await Group.updateOne({ roomId }, { $addToSet: { members: targetLower } });

        // ==================== INSERTED OPTIMIZED BLOCK ====================
        const targetSockets = await io.in(`user:${targetLower}`).fetchSockets();
        const targetIsOnline = targetSockets.length > 0;

        if (targetIsOnline) {
            targetSockets.forEach(client => client.join(roomId));
            io.to(`user:${targetLower}`).emit('cluster_joined', groupRef);
            io.to(`user:${targetLower}`).emit('notify', { m: `You have been deployed into Cluster: ${groupData.groupName}`, type: "info" });
        }

        socket.emit('notify', { 
            m: `Node [${targetUsername}] spliced into stream. Status: ${targetIsOnline ? 'LIVE_SYNC' : 'DEFERRED_SYNC'}`, 
            type: "success" 
        });
        // =================================================================
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

        socket.join(roomId);
        socket.emit('dm_started', { ...senderRef, initiatedByMe: true });

        // ==================== PHASE 2: CHECK IF TARGET IS ONLINE ====================
        const targetLower = target.toLowerCase();
        const isTargetOnline = onlineUsers.has(targetLower);

        // Notify the initiator about the target's status
        socket.emit('user_status', {
            username: targetLower,
            status: isTargetOnline ? 'online' : 'offline',
            roomId: roomId
        });

        // If target is online, join them and send status
        for (const [_, client] of io.sockets.sockets) {
            if (client.data.username === targetLower) {
                client.join(roomId);
                client.emit('dm_started', { ...receiverRef, initiatedByMe: false });
                // Notify target about initiator's status
                client.emit('user_status', {
                    username: socket.data.username,
                    status: 'online',
                    roomId: roomId
                });
            }
        }

    } catch (err) {
        console.error("[START_DM_ERROR]", err);
    }
    });

 socket.on('join_room', async (roomId) => {
    try {
        if (!roomId || !socket.data.username) return;

        if (roomId.startsWith('CLUSTER_')) {
            const groupData = await Group.findOne({ roomId });
            if (!groupData) return;
            if (!groupData.isPublic && !groupData.members.includes(socket.data.username)) {
                return socket.emit('notify', { m: "CLUSTER_ENCLAVE_RESTRICTED", type: "error" });
            }
            const groupRef = { roomId: groupData.roomId, groupName: groupData.groupName, isDM: false };
            await User.updateOne({ username: socket.data.username }, { $addToSet: { groups: groupRef } });
            await Group.updateOne({ roomId }, { $addToSet: { members: socket.data.username } });
        }

        socket.join(roomId);

        // Fetch history (unchanged)
        const history = await Message.find({ room: roomId })
            .sort({ timestamp: -1 })
            .limit(150);
        history.reverse();
        socket.emit('chat_history', history);

        //SEND ONLINE USERS IN THIS ROOM
        let onlineUsersInRoom = [];

        if (roomId.startsWith('DM_')) {
            // DM: Check if the other user is online
            const parts = roomId.split('_').slice(1);
            const otherUser = parts.find(u => u.toLowerCase() !== socket.data.username.toLowerCase());
            if (otherUser && onlineUsers.has(otherUser)) {
                onlineUsersInRoom.push(otherUser);
            }
        } else if (roomId.startsWith('CLUSTER_')) {
            // Group: Get all members and filter online
            const group = await Group.findOne({ roomId });
            if (group && group.members) {
                onlineUsersInRoom = group.members.filter(m => onlineUsers.has(m.toLowerCase()));
            }
        }

        // Send the list of online users to the client who just joined
        socket.emit('room_online_users', {
            roomId: roomId,
            users: onlineUsersInRoom
        });

    } catch (err) {
        console.error("[JOIN_ROOM_ERROR]", err);
    }
});

socket.on('send_msg', async (p, callback) => {
    try {
        if (!socket.data.username || !p.room || !p.text?.trim()) {
            if (callback) callback({ error: 'Invalid message' });
            return;
        }

        const user = await User.findOne({ username: socket.data.username });
        const isVip = user?.isVip || false;

        let finalRoomName = p.roomName || p.room;

        if (p.room.startsWith('DM_')) {
            const parts = p.room.split('_').slice(1);
            const otherUser = parts.find(u => u.toLowerCase() !== socket.data.username.toLowerCase());
            if (otherUser) finalRoomName = otherUser;
        }

        const msgConfig = {
            room: p.room,
            roomName: finalRoomName,
            sender: socket.data.username,
            text: p.text.trim(),
            isVip,
            timestamp: new Date(),
            delivered: [], // Empty initially
            read: []      // Empty initially
        };

        if (p.replyTo) {
            msgConfig.replyTo = {
                msgId: p.replyTo.msgId,
                sender: p.replyTo.sender,
                text: p.replyTo.text
            };
        }

        const msg = new Message(msgConfig);
        await msg.save();

        // Send the message to the room (including the sender)
        io.to(p.room).emit('new_msg', msg);

        // ==================== PHASE 3: ACKNOWLEDGEMENT ====================
        // Send a "sent" confirmation back to the sender with the message ID
        if (callback) {
            callback({ success: true, msgId: msg._id });
        }

        // Send push notifications (unchanged)
        await sendPushToRoom(
            p.room,
            finalRoomName,
            socket.data.username,
            socket.data.username,
            p.text.trim()
        );

        // CRITICAL: Automatically mark the message as DELIVERED to the sender's own devices
        // so the sender sees "✓" immediately (since they sent it)
        const senderLower = socket.data.username.toLowerCase();
        if (!msg.delivered.includes(senderLower)) {
            msg.delivered.push(senderLower);
            await msg.save();
        }

        // Also automatically mark as READ for the sender
        if (!msg.read.includes(senderLower)) {
            msg.read.push(senderLower);
            await msg.save();
        }

        // Notify the sender about the delivery status
        io.to(`user:${senderLower}`).emit('delivery_update', {
            msgId: msg._id,
            delivered: msg.delivered,
            read: msg.read
        });

        // For DMs: Check if the recipient is online and deliver immediately
        if (p.room.startsWith('DM_')) {
            const parts = p.room.split('_').slice(1);
            const otherUser = parts.find(u => u.toLowerCase() !== senderLower);
            if (otherUser) {
                // Check if the recipient is online via our onlineUsers Map
                const isRecipientOnline = onlineUsers.has(otherUser.toLowerCase());
                
                if (isRecipientOnline) {
                    // Recipient is online, they will receive the message via 'new_msg' event
                    // and then they will emit 'message_delivered' and 'message_read'
                    // No extra action needed here
                    console.log(`[DELIVERY] ${otherUser} is online, waiting for delivery receipt`);
                } else {
                    // Recipient is offline - message will be delivered when they come online
                    console.log(`[DELIVERY] ${otherUser} is offline, delivery pending`);
                }
            }
        }

    } catch (err) {
        console.error("[SEND_MSG_ERROR]", err);
        if (callback) callback({ error: 'Server error' });
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


    //DELIVERY & READ RECEIPTS
    //Client acknowledges they received a message (delivered)
    socket.on('message_delivered', async ({ msgId }) => {
      try {
          if (!socket.data.username || !msgId) return;

            const username = socket.data.username.toLowerCase();
          const msg = await Message.findById(msgId);
          if (!msg) return;

          // Only add if not already in the delivered list
         if (!msg.delivered.includes(username)) {
              msg.delivered.push(username);
             await msg.save();

                // Notify the sender (if they're online) that this message was delivered
             io.to(`user:${msg.sender.toLowerCase()}`).emit('delivery_update', {
                 msgId: msgId,
                delivered: msg.delivered,
                read: msg.read
                 });
            }
             } catch (err) {
             console.error("[DELIVERY_UPDATE_ERROR]", err);
        }
    });

//Client acknowledges they read a message (read)
socket.on('message_read', async ({ msgId }) => {
    try {
        if (!socket.data.username || !msgId) return;

        const username = socket.data.username.toLowerCase();
        const msg = await Message.findById(msgId);
        if (!msg) return;

        // If not read yet, add to read list AND ensure delivered is also added
        if (!msg.read.includes(username)) {
            msg.read.push(username);
            
            // Also mark as delivered (if not already)
            if (!msg.delivered.includes(username)) {
                msg.delivered.push(username);
            }
            
            await msg.save();

            // Notify the sender (if they're online) that this message was read
            io.to(`user:${msg.sender.toLowerCase()}`).emit('read_update', {
                msgId: msgId,
                delivered: msg.delivered,
                read: msg.read
            });
        }
    } catch (err) {
        console.error("[READ_UPDATE_ERROR]", err);
    }
});

//Mark all messages in a room as read
socket.on('room_messages_read', async ({ roomId, messageIds }) => {
    try {
        if (!socket.data.username || !roomId || !messageIds || messageIds.length === 0) return;

        const username = socket.data.username.toLowerCase();

        // Update all messages in this room that the user hasn't read yet
        const result = await Message.updateMany(
            { 
                _id: { $in: messageIds },
                sender: { $ne: socket.data.username }, // Don't mark own messages as read
                read: { $ne: username } // Only if not already read
            },
            { 
                $addToSet: { read: username, delivered: username }
            }
        );

        if (result.modifiedCount > 0) {
            // Fetch the updated messages to broadcast delivery/read updates to senders
            const updatedMessages = await Message.find({ 
                _id: { $in: messageIds },
                sender: { $ne: socket.data.username }
            });

            // Notify each sender about their messages being read
            const senderMap = {};
            updatedMessages.forEach(msg => {
                const sender = msg.sender.toLowerCase();
                if (!senderMap[sender]) senderMap[sender] = [];
                senderMap[sender].push({ msgId: msg._id, delivered: msg.delivered, read: msg.read });
            });

            for (const [sender, msgs] of Object.entries(senderMap)) {
                io.to(`user:${sender}`).emit('batch_read_update', { messages: msgs });
            }
        }
    } catch (err) {
        console.error("[BATCH_READ_ERROR]", err);
    }
});
    // ==================== REAL-TIME INTERACTIVE TIC TAC TOE ENGINE ====================
    socket.on('create_match', async ({ roomId, chosenSign, targetUser }) => {
        try {
            if (!socket.data.username || !roomId) return;
            const creator = socket.data.username.toLowerCase();
            const target = targetUser ? targetUser.trim().toLowerCase() : "enclave_challenger";
            let pX = "", pO = "";

            if (chosenSign === "O") { pO = creator; pX = target; } 
            else { pX = creator; pO = target; }

            const match = new Match({ roomId, playerX: pX, playerO: pO, turn: "X", status: "ACTIVE" });
            await match.save();

            const msg = new Message({
                room: roomId,
                sender: "SYSTEM",
                text: target === "enclave_challenger" 
                    ? `@${creator.toUpperCase()} DEPLOYED AN OPEN CHALLENGE BEACON!` 
                    : `@${creator.toUpperCase()} ISSUED A TARGETED DUEL TO @${target.toUpperCase()}!`,
                type: "TICTACTOE",
                matchId: match._id,
                timestamp: new Date()
            });
            await msg.save();

            io.to(roomId).emit('new_msg', msg);
            io.to(roomId).emit('match_updated', match);
        } catch (err) { console.error("[CREATE_MATCH_ERROR]", err); }
    });

    // PROCESS MOVE SELECTION (WITH REFLECTIVE HISTORY PERSISTENCE LAYER)
    socket.on('make_move', async ({ matchId, index }) => {
        try {
            const username = socket.data.username.toLowerCase();
            const match = await Match.findById(matchId);
            if (!match || match.status !== "ACTIVE") return;

            let systemBroadcastText = "";

            // 1. ARCADE SLOT FILL DETECTION
            if (match.playerX === "enclave_challenger" && username !== match.playerO) {
                match.playerX = username;
                systemBroadcastText = `@${username.toUpperCase()} ACCEPTS CORES. MATCH LOGGED AGAINST @${match.playerO.toUpperCase()}!`;
            } else if (match.playerO === "enclave_challenger" && username !== match.playerX) {
                match.playerO = username;
                systemBroadcastText = `@${username.toUpperCase()} ACCEPTS CORES. MATCH LOGGED AGAINST @${match.playerX.toUpperCase()}!`;
            }

            // Spectator check guards
            if (match.playerX === "enclave_challenger" || match.playerO === "enclave_challenger") {
                if (username !== match.playerX && username !== match.playerO) return;
            }

            const isPlayerX = username === match.playerX;
            const isPlayerO = username === match.playerO;
            const currentSign = match.turn;

            if ((currentSign === "X" && !isPlayerX) || (currentSign === "O" && !isPlayerO)) return;
            if (match.board[index] !== "") return;

            // Update board state array values
            match.board[index] = currentSign;

            // Win evaluation pass matrix
            const winCombos = [[0,1,2], [3,4,5], [6,7,8], [0,3,6], [1,4,7], [2,5,8], [0,4,8], [2,4,6]];
            let hasWon = false;
            for (const combo of winCombos) {
                if (match.board[combo[0]] && match.board[combo[0]] === match.board[combo[1]] && match.board[combo[0]] === match.board[combo[2]]) {
                    hasWon = true; 
                    break;
                }
            }

            if (hasWon) {
                match.status = "WON";
                match.winner = username;
            } else if (!match.board.includes("")) {
                match.status = "DRAW";
                match.winner = "DRAW";
            } else {
                match.turn = currentSign === "X" ? "O" : "X";
            }

            await match.save();

            // ==================== CRITICAL FIX: CHAT STREAM STATE PERSISTENCE ====================
            // Find the master message node rendering this board template inside the DB
            const parentMessage = await Message.findOne({ matchId: match._id });
            if (parentMessage) {
                // Encode the current snapshot arrays directly into the message text payload parameters
                parentMessage.text = JSON.stringify({
                    board: match.board,
                    status: match.status,
                    turn: match.turn,
                    playerX: match.playerX,
                    playerO: match.playerO,
                    winner: match.winner
                });
                await parentMessage.save();
            }

            // 2. DISPATCH SYSTEM ENCLAVE ACCEPTANCE INTERCEPT MESSAGE IF ENCRYPTED
            if (systemBroadcastText) {
                const notice = new Message({
                    room: match.roomId,
                    sender: "SYSTEM",
                    text: systemBroadcastText,
                    timestamp: new Date()
                });
                await notice.save();
                io.to(match.roomId).emit('new_msg', notice);
            }

            // If a win or draw is registered, dispatch an explicit system message announcement to the chat flow logs
            if (match.status === "WON" || match.status === "DRAW") {
                const endNoticeText = match.status === "WON" 
                    ? `🏆 Result: @${match.winner.toUpperCase()} SECURED TOTAL VICTORY IN TIC-TAC-TOE!`
                    : `⚖️ ENGAGEMENT CONCLUDED: Match is a  DRAW!`;

                const endNotice = new Message({
                    room: match.roomId,
                    sender: "SYSTEM",
                    text: endNoticeText,
                    timestamp: new Date()
                });
                await endNotice.save();
                io.to(match.roomId).emit('new_msg', endNotice);
            }

            // Sync all connected viewports instantly
            io.to(match.roomId).emit('match_updated', match);

        } catch (err) { 
            console.error("[MAKE_MOVE_ERROR]", err); 
        }
    });

    //TIMEOUT STATE PERSISTENCE
    
socket.on('match_timeout_close', async ({ matchId }) => {
    try { 
        const match = await Match.findOneAndUpdate(
            { _id: matchId, status: "ACTIVE" }, 
            { status: "TIMEOUT" }, 
            { new: true }
        ); 
        if (match) {
            const parentMessage = await Message.findOne({ matchId });
            if (parentMessage) {
                parentMessage.text = JSON.stringify({
                    board: match.board, status: match.status, turn: match.turn,
                    playerX: match.playerX, playerO: match.playerO, winner: match.winner
                });
                await parentMessage.save();
            }
            io.to(match.roomId).emit('match_updated', match);
        }
    } catch (err) { console.error("[MATCH_TIMEOUT_CLOSE_ERROR]", err); }
});

    async function announceDuelAcceptance(room, challenger, creator) {
        const notice = new Message({
            room, sender: "SYSTEM",
            text: `@${challenger.toUpperCase()} COMPROMISED CORES. MATCH LOGGED AGAINST @${creator.toUpperCase()}!`,
            timestamp: new Date()
        });
        await notice.save();
        io.to(room).emit('new_msg', notice);
    }

    socket.on('disconnect', () => {
    console.log(`[NET] Port closed: ${socket.id}`);

    //REMOVE FROM ONLINE TRACKER
    if (socket.data.username) {
        const username = socket.data.username.toLowerCase();

        // Remove from tracker
        onlineUsers.delete(username);
        console.log(`[PRESENCE] ${username} is now OFFLINE (${onlineUsers.size} total)`);

        // Broadcast offline status to all rooms the user was in
        const rooms = Array.from(socket.rooms);
        rooms.forEach(roomId => {
            if (roomId !== socket.id) { // Skip the socket's own room
                io.to(roomId).emit('user_status', {
                    username: username,
                    status: 'offline',
                    roomId: roomId
                });
            }
        });
    }
});
});

//   PROGRESSIVE WEB APP PUSH SYSTEM 
const webpush = require('web-push');



if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_EMAIL,
        process.env.VAPID_PUBLIC_KEY, 
        process.env.VAPID_PRIVATE_KEY  
    );
    console.log('>>> [PUSH_SYSTEM]: Web-Push configured successfully.');
} else {
    console.warn('>>> [PUSH_SYSTEM]: VAPID keys not found. Check your variable names!');
}


//PUSH NOTIFICATION 
async function sendPushToRoom(roomId, roomName, senderUsername, title, body) {
    // Guard: check VAPID keys
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
        console.warn('[PUSH] VAPID keys missing – aborting');
        return;
    }

    try {
        // Get all members of this room (excluding sender)
        const members = await User.find({ 'groups.roomId': roomId }).select('username').lean();
        const memberUsernames = members.map(u => u.username);
        const recipients = memberUsernames.filter(u => u.toLowerCase() !== senderUsername.toLowerCase());

        if (recipients.length === 0) {
            console.log('[PUSH] No other members in room – skipping');
            return;
        }

        // Fetch subscriptions for recipients
        const subscriptions = await PushSubscription.find({
            username: { $in: recipients }
        }).lean();

        console.log(`[PUSH] Found ${subscriptions.length} subscriptions for room ${roomId}`);

        if (subscriptions.length === 0) return;

        // Build payload with ALL fields for deep-linking and per-user threading
        const payload = JSON.stringify({
            title: title,                      // Sender's username (or "SYSTEM")
            body: body,                        // Message content
            sender: senderUsername,            // Unique tag per sender
            roomId: roomId,                    // For deep-linking
            roomName: roomName || roomId       // For display
        });

        // Send to each subscription
        for (const record of subscriptions) {
            try {
                await webpush.sendNotification(record.subscription, payload);
                console.log(`[PUSH] Sent to ${record.username}`);
            } catch (err) {
                if (err.statusCode === 410 || err.statusCode === 404) {
                    console.log(`[PUSH] Subscription expired for ${record.username} – removing`);
                    await PushSubscription.deleteOne({ _id: record._id });
                } else {
                    console.error(`[PUSH] Failed to send to ${record.username}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.error('[PUSH] Error in sendPushToRoom:', err);
    }
}
// Memory storage tracking active device tokens (Keep it simple before DB setup)
let deviceSubscriptions = [];

// API Endpoint to collect subscription map strings from incoming devices

app.post('/api/register-push-device', async (req, res) => {
    const { subscription, username } = req.body;
    if (!subscription || !subscription.endpoint || !username) {
        return res.status(400).json({ error: 'Invalid device registration layout.' });
    }
    
    const targetUser = username.trim().toLowerCase();
    
    // Save to MongoDB
    await PushSubscription.updateOne(
        { username: targetUser },
        { $set: { subscription: subscription } },
        { upsert: true }
    );
    
    res.status(201).json({ status: 'success' });
});



// A core function to broadcast alerts to all background devices
// function broadcastSystemNotification(titleText, bodyText, senderUsername = null) {
//     if (!PUBLIC_VAPID_KEY || !PRIVATE_VAPID_KEY) return;

//     const payload = JSON.stringify({ title: titleText, body: bodyText });
//     // Normalize to prevent case-sensitivity issues (e.g., 'Ramim' vs 'ramim')
//     const normalizedSender = senderUsername ? senderUsername.trim().toLowerCase() : null;

//     deviceSubscriptions.forEach((entry, index) => {
//         // --- THE FIX ---
//         // If the device's registered user is the same as the sender, skip this iteration!
//         if (normalizedSender && entry.username && entry.username.toLowerCase() === normalizedSender) {
//             return; 
//         }

//         webpush.sendNotification(entry.subscription, payload)
//             .catch(error => {
//                 if (error.statusCode === 410) {
//                     deviceSubscriptions.splice(index, 1);
//                 }
//             });
//     });
// }

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`>>> [DISCHAT_CORE_v3.0] Server initialized on port ${PORT}`);
});