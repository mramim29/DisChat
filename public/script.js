// script.js - FINAL FIXED VERSION (DM Notifications + Auto Login + Stability)

const socket = io();

let me = "";
let curRoom = "";
let curRoomName = "";
let isVipUser = false;
let currentTheme = localStorage.getItem('dischat-theme') || 'cyan';
let bubbleStyle = localStorage.getItem('dischat-bubble') || 'rect';
let vipEffect = localStorage.getItem('dischat-vipeffect') || 'neon';

// ====================== UTILITIES ======================
function showNotify(text, title = "SYSTEM", type = "info", roomId = null, roomName = null) {
    const bin = document.getElementById('toast-bin');
    if (bin.children.length > 5) bin.removeChild(bin.children[0]);

    const t = document.createElement('div');
    t.className = `notification-toast ${type}`;
    t.innerHTML = `<strong style="color:var(--neon)">[${title}]</strong><br>${text}`;

    if (roomId) {
        t.style.cursor = "pointer";
        t.onclick = () => { 
            t.remove(); 
            joinRoom(roomId, roomName || roomId); 
        };
    }
    bin.appendChild(t);
    setTimeout(() => t.remove(), 7000);
}

function auth(type) {
    const u = document.getElementById('l-u').value.trim();
    const p = document.getElementById('l-p').value.trim();
    if (!u || !p) return showNotify("IDENTITY_ID AND PASSKEY REQUIRED", "ERROR", "error");
    
    socket.emit(type, { username: u, password: p });
    
    if (type === 'login') {
        localStorage.setItem('dischat_username', u);
        localStorage.setItem('dischat_password', p);
    }
}

function tryAutoLogin() {
    const savedUsername = localStorage.getItem('dischat_username');
    const savedPassword = localStorage.getItem('dischat_password');
    
    if (savedUsername && savedPassword) {
        console.log("[AUTO LOGIN] Attempting with", savedUsername);
        socket.emit('login', { username: savedUsername, password: savedPassword });
    }
}

// ====================== CREATE GROUP ======================
function openCreateGroupModal() {
    const html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1rem;">CREATE NEW CLUSTER</h2>
        <input id="group-name" class="gate-input" placeholder="Cluster Name" style="margin-bottom:1rem;">
        <div style="margin:15px 0;">
            <label style="color:#ccc;">
                <input type="checkbox" id="is-public" checked> Public Cluster
            </label>
        </div>
        <input id="group-pass" class="gate-input" type="password" placeholder="Password (private)" style="display:none; margin-bottom:1rem;">
        <button class="gate-btn" onclick="createCluster()" style="margin-top:10px;">CREATE CLUSTER</button>
        <button class="gate-btn outline" onclick="closeModal()" style="margin-top:8px;">CANCEL</button>
    `;
    showModal(html);

    setTimeout(() => {
        const cb = document.getElementById('is-public');
        const pass = document.getElementById('group-pass');
        if (cb && pass) cb.onchange = () => pass.style.display = cb.checked ? 'none' : 'block';
    }, 100);
}

function createCluster() {
    const groupName = document.getElementById('group-name').value.trim();
    if (!groupName) return showNotify("Cluster name required", "ERROR", "error");

    const isPublic = document.getElementById('is-public').checked;
    const password = document.getElementById('group-pass').value.trim();

    socket.emit('create_cluster', { groupName, isPublic, password: isPublic ? "" : password });
    closeModal();
}

// ====================== HELPER ======================
function getDMOtherUser(roomId) {
    if (!roomId || !roomId.startsWith('DM_')) return null;
    const parts = roomId.split('_').slice(1);
    return parts.find(u => u !== me) || null;
}

// ====================== RENDER NODE ======================
function renderNode(g) {
    const list = g.isDM ? document.getElementById('dm-list') : document.getElementById('cluster-list');
    if (document.getElementById(`node-${g.roomId}`)) return;

    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "nav-item";

    let displayName = g.groupName;
    if (g.isDM) {
        const other = getDMOtherUser(g.roomId);
        displayName = other || g.groupName;
    }

    div.innerText = `[${g.isDM ? 'DM' : 'C'}] ${displayName}`;
    div.onclick = () => joinRoom(g.roomId, displayName);
    list.appendChild(div);
}

function joinRoom(id, name) {
    if (curRoom === id) return;

    curRoom = id;
    curRoomName = name || id;

    document.getElementById('active-room').innerText = curRoomName;
    document.getElementById('msg-flow').innerHTML = "";

    socket.emit('join_room', id);
    if (window.innerWidth < 768) toggleSide();
}

function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');
    const isMe = m.sender === me;

    const vipClass = m.isVip ? `vip-message vip-${vipEffect}` : '';

    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''} ${bubbleStyle} ${vipClass}`;

    const vipTag = m.isVip ? ' ★VIP' : '';

    div.innerHTML = `
        <div class="bubble-content">
            <small style="color:var(--neon)">[${m.sender}]${vipTag}</small><br>
            ${m.text}
        </div>
    `;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

function sendMsg() {
    const i = document.getElementById('m-in');
    if (i.value.trim() && curRoom) {
        socket.emit('send_msg', { 
            room: curRoom, 
            text: i.value.trim(), 
            roomName: curRoomName 
        });
        i.value = "";
    }
}

// ====================== SEARCH ======================
function handleSearch() {
    const query = document.getElementById('net-search').value.trim();
    const drop = document.getElementById('search-drop');
    
    if (query.length < 2) {
        drop.style.display = 'none';
        return;
    }
    socket.emit('global_search', query);
}

socket.on('search_results', ({ users, groups }) => {
    const drop = document.getElementById('search-drop');
    drop.innerHTML = '';
    drop.style.display = 'block';

    if ((!users || users.length === 0) && (!groups || groups.length === 0)) {
        drop.innerHTML = `<div style="padding:15px; color:#666; text-align:center;">No results found</div>`;
        return;
    }

    if (users && users.length > 0) {
        const header = document.createElement('div');
        header.style.padding = '8px 12px';
        header.style.color = 'var(--neon)';
        header.style.fontSize = '0.8rem';
        header.textContent = 'USERS';
        drop.appendChild(header);

        users.forEach(user => {
            const el = document.createElement('div');
            el.className = 'nav-item';
            el.style.padding = '10px 16px';
            el.innerHTML = `${user.username} ${user.isVip ? '★VIP' : ''}`;
            el.onclick = () => {
                drop.style.display = 'none';
                startDM(user.username);
            };
            drop.appendChild(el);
        });
    }

    if (groups && groups.length > 0) {
        const header = document.createElement('div');
        header.style.padding = '8px 12px';
        header.style.color = 'var(--neon)';
        header.style.fontSize = '0.8rem';
        header.textContent = 'GROUPS';
        drop.appendChild(header);

        groups.forEach(group => {
            const el = document.createElement('div');
            el.className = 'nav-item';
            el.style.padding = '10px 16px';
            el.innerHTML = group.groupName;
            el.onclick = () => {
                drop.style.display = 'none';
                joinRoom(group.roomId, group.groupName);
            };
            drop.appendChild(el);
        });
    }
});

// ====================== DM ======================
function startDM(username) {
    if (username === me) return showNotify("Cannot message yourself", "ERROR", "error");

    const roomId = `DM_${[me, username].sort().join('_')}`;
    const roomName = username;

    socket.emit('start_dm', { target: username, roomId, roomName });
    document.getElementById('search-drop').style.display = 'none';
}

// ====================== PROFILE ======================
function renderUserProfile() {
    let html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1.5rem;">USER PROFILE</h2>
        <div style="text-align:center; margin-bottom:2rem;">
            <div class="avatar-round" style="margin:0 auto; width:90px; height:90px; font-size:2.8rem;">
                ${me ? me[0].toUpperCase() : '?'}
            </div>
            <h3 style="margin:1rem 0 0.5rem; color:#fff;">${me}</h3>
            <div style="color:${isVipUser ? '#ff00ff' : '#00f2ff'}; font-weight:bold;">
                ${isVipUser ? '★ VIP USER' : 'STANDARD USER'}
            </div>
        </div>

        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">THEME</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${currentTheme==='cyan'?'active':''}" onclick="changeTheme('cyan')" style="flex:1;">CYAN</button>
                <button class="gate-btn outline ${currentTheme==='amber'?'active':''}" onclick="changeTheme('amber')" style="flex:1;">AMBER</button>
                <button class="gate-btn outline ${currentTheme==='matrix'?'active':''}" onclick="changeTheme('matrix')" style="flex:1;">MATRIX</button>
            </div>
        </div>

        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">BUBBLE STYLE</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${bubbleStyle==='rect'?'active':''}" onclick="changeBubbleStyle('rect')" style="flex:1;">RECT</button>
                <button class="gate-btn outline ${bubbleStyle==='round'?'active':''}" onclick="changeBubbleStyle('round')" style="flex:1;">ROUND</button>
                <button class="gate-btn outline ${bubbleStyle==='bubble'?'active':''}" onclick="changeBubbleStyle('bubble')" style="flex:1;">BUBBLE</button>
            </div>
        </div>

        ${isVipUser ? `
        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">VIP GLOW EFFECT</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${vipEffect==='neon'?'active':''}" onclick="changeVipEffect('neon')" style="flex:1;">NEON</button>
                <button class="gate-btn outline ${vipEffect==='fire'?'active':''}" onclick="changeVipEffect('fire')" style="flex:1;">FIRE</button>
                <button class="gate-btn outline ${vipEffect==='pulse'?'active':''}" onclick="changeVipEffect('pulse')" style="flex:1;">PULSE</button>
            </div>
        </div>` : ''}

        <button onclick="logout()" class="gate-btn" style="margin-top:2rem; background:#ff0055; color:white;">LOGOUT</button>
    `;
    showModal(html);
}

function changeVipEffect(effect) {
    vipEffect = effect;
    localStorage.setItem('dischat-vipeffect', effect);
    renderUserProfile();
    if (curRoom) socket.emit('join_room', curRoom);
}

function changeTheme(theme) {
    currentTheme = theme;
    localStorage.setItem('dischat-theme', theme);
    applyTheme(theme);
    renderUserProfile();
}

function changeBubbleStyle(style) {
    bubbleStyle = style;
    localStorage.setItem('dischat-bubble', style);
    renderUserProfile();
    if (curRoom) socket.emit('join_room', curRoom);
}

function applyTheme(theme) {
    const colors = { cyan: '#00f2ff', amber: '#ffcc00', matrix: '#00ff41' };
    document.documentElement.style.setProperty('--neon', colors[theme] || '#00f2ff');
}

function showModal(content) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <div style="position:relative; padding-right:45px;">
            <button onclick="closeModal()" style="position:absolute; top:8px; right:15px; background:none; border:none; color:var(--neon); font-size:2.8rem;">×</button>
            ${content}
        </div>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function closeModal() {
    document.getElementById('modal-bg').style.display = 'none';
}

function openProfile(type) {
    if (type === 'room') {
        if (curRoom === 'global') showGlobalInfo();
        else showNotify("Room Info", "INFO", "info");
    } else {
        renderUserProfile();
    }
}

function showGlobalInfo() {
    showModal(`<h2 style="color:var(--neon)">GLOBAL CHAT</h2>
        <p style="text-align:center; opacity:0.8;">Public channel for all approved users.</p>
        <button class="gate-btn" onclick="closeModal()">CLOSE</button>`);
}

function logout() {
    localStorage.removeItem('dischat_username');
    localStorage.removeItem('dischat_password');
    location.reload();
}

// ====================== SOCKET EVENTS ======================
socket.on('login_success', (d) => {
    me = d.username;
    isVipUser = !!d.isVip;
    localStorage.setItem('dischat_username', me);

    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0]?.toUpperCase() || '?';

    if (d.groups) d.groups.forEach(renderNode);

    applyTheme(currentTheme);
    joinRoom('global', 'GLOBAL CHAT');
});

socket.on('cluster_joined', g => { 
    renderNode(g); 
    joinRoom(g.roomId, g.groupName); 
});

socket.on('dm_started', g => { 
    renderNode(g); 
    joinRoom(g.roomId, g.groupName); 
});

// **MAIN FIX FOR DM NOTIFICATIONS**
socket.on('new_msg', m => {
    console.log(`[NEW_MSG] Room:${m.room} | Current:${curRoom} | Sender:${m.sender} | roomName:${m.roomName}`);

    if (m.room === curRoom) {
        appendMsg(m);
        return;
    }

    // Stronger fallback for DM display name
    let displayName = m.roomName || m.room;
    if (m.room && m.room.startsWith('DM_')) {
        const otherUser = getDMOtherUser(m.room);
        if (otherUser) displayName = otherUser;
    }

    showNotify(
        `New message from <strong>${m.sender}</strong> in ${displayName}`, 
        m.isVip ? "VIP MESSAGE" : "INCOMING", 
        m.isVip ? "error" : "info", 
        m.room, 
        displayName
    );
});

socket.on('chat_history', logs => logs.forEach(appendMsg));

socket.on('auth_status', d => {
    const el = document.getElementById('auth-msg');
    el.innerText = `> ${d.m}`;
    el.style.color = d.ok ? 'var(--neon)' : 'var(--danger)';
});

socket.on('notify', d => showNotify(d.m, "SYSTEM", d.type || "info"));

function toggleSide() {
    document.getElementById('sidebar').classList.toggle('active');
}

window.onload = () => {
    tryAutoLogin();
    setTimeout(() => document.getElementById('m-in')?.focus(), 800);
};