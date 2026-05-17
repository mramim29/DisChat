// script.js - ENTERPRISE GRADE ARCHITECTURE
const socket = io();

let me = "";
let curRoom = "";
let curRoomName = "";
let isVipUser = false;
let currentTheme = localStorage.getItem('dischat-theme') || 'cyan';
let bubbleStyle = localStorage.getItem('dischat-bubble') || 'rect';
let vipEffect = localStorage.getItem('dischat-vipeffect') || 'neon';

// ====================== NOTIFICATION & AUDIO SETUP ======================
const notificationSound = document.getElementById('notification-sound');

function playNotificationSound() {
    if (notificationSound) {
        notificationSound.currentTime = 0;
        notificationSound.play().catch(() => {}); // Ignore autoplay restrictions
    }
}

function showSystemNotification(title, body, roomId = null, roomName = null) {
    if (!("Notification" in window) || Notification.permission !== "granted") return;

    const notification = new Notification(title, {
        body: body,
        icon: "/favicon.ico", 
        tag: roomId || "dischat-global" 
    });

    notification.onclick = () => {
        window.focus();
        if (roomId) {
            joinRoom(roomId, roomName || roomId);
        }
        notification.close();
    };
}

// ====================== UTILITIES ======================
function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

function showNotify(text, title = "SYSTEM", type = "info", roomId = null, roomName = null) {
    const bin = document.getElementById('toast-bin');
    if (bin.children.length > 5) bin.removeChild(bin.children[0]);

    const t = document.createElement('div');
    t.className = `notification-toast ${type}`;
    t.innerHTML = `<strong style="color:var(--neon)">[${escapeHTML(title)}]</strong><br>${escapeHTML(text)}`;

    if (roomId) {
        t.style.cursor = "pointer";
        t.onclick = () => { 
            t.remove(); 
            joinRoom(roomId, roomName || roomId); 
        };
    }
    bin.appendChild(t);
    setTimeout(() => {
        if (t.parentNode === bin) bin.removeChild(t);
    }, 7000);

    const shouldNotify = 
        document.visibilityState !== 'visible' || 
        (roomId && roomId !== curRoom);

    if (shouldNotify) {
        playNotificationSound();
        showSystemNotification(title, text, roomId, roomName);
    }
}

// ====================== MANUAL & ONBOARDING FLOW ======================
function enterAuthentication() {
    document.getElementById('manual-layer').style.display = 'none';
    document.getElementById('auth-layer').style.display = 'flex';
}

function showUserManualModal() {
    const html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1.5rem;">USER_MANUAL</h2>
        <div style="font-size:0.9rem; line-height:1.6; text-align:left; max-height:55vh; overflow-y:auto; padding-right:8px; color:#c9d1d9;">
            <p style="margin-bottom:1rem;"><strong style="color:var(--neon);">1. IDENTITY REGISTRATION:</strong> New nodes can use 'REGISTER_NEW_ID'. All requests are securely processed and require Admin confirmation before they can log in.</p>
            <p style="margin-bottom:1rem;"><strong style="color:var(--neon);">2. GLOBAL FREQUENCY:</strong> The <code style="color:var(--neon)">_GLOBAL</code> room is a master broadcast pipeline linked across all user terminals simultaneously.</p>
            <p style="margin-bottom:1rem;"><strong style="color:var(--neon);">3. CLUSTER ENCLAVES:</strong> Use the <span style="color:var(--neon); font-weight:bold;">[+]</span> toggle near _CLUSTERS to establish custom channels. Public channels are indexable via search, and Private channels are locked via password hash keying.</p>
            <p style="margin-bottom:1rem;"><strong style="color:var(--neon);">4. PEER LOGISTICS (DM):</strong> Execute search queries inside the <code style="color:var(--neon)">SEARCH_NET...</code> input field. Clicking a target operator opens a secure peer-to-peer chat session.</p>
            <p style="margin-bottom:1rem;"><strong style="color:var(--neon);">5. SYSTEM CALIBRATION:</strong> Click your avatar frame anytime to modify theme environments, message node geometries, or your specific VIP system aesthetics.</p>
        </div>
        <button class="gate-btn" onclick="closeModal()" style="margin-top:1.5rem;">DISMISS MANUAL</button>
    `;
    showModal(html);
}

// ====================== AUTH ======================
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
        socket.emit('login', { username: savedUsername, password: savedPassword });
    }
}

// ====================== CREATE CLUSTER ======================
function openCreateGroupModal() {
    const html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1rem;">CREATE NEW CLUSTER</h2>
        <input id="group-name" class="gate-input" placeholder="Cluster Name" style="margin-bottom:1rem;" autocomplete="off">
        <div style="margin:15px 0;">
            <label style="color:#ccc; cursor:pointer;">
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
    return parts.find(u => u.toLowerCase() !== me.toLowerCase()) || null;
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
        if (other) displayName = other;
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
    
    if (window.innerWidth < 768) {
        toggleSide();
    }
}

function closeSidebarOnChatClick() {
    const viewport = document.querySelector('.viewport');
    if (viewport) {
        viewport.addEventListener('click', (e) => {
            if (e.target.closest('.input-bay') || e.target.closest('.view-header')) return;
            if (window.innerWidth < 768) {
                const sidebar = document.getElementById('sidebar');
                if (sidebar.classList.contains('active')) sidebar.classList.remove('active');
            }
        });
    }
}

function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');
    const isMe = m.sender.toLowerCase() === me.toLowerCase();
    const vipClass = m.isVip ? `vip-message vip-${vipEffect}` : '';

    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''} ${bubbleStyle} ${vipClass}`;

    const vipTag = m.isVip ? ' ★VIP' : '';
    const safeSender = escapeHTML(m.sender);
    const safeText = escapeHTML(m.text);

    div.innerHTML = `
        <div class="bubble-content">
            <small style="color:var(--neon)">[${safeSender}]${vipTag}</small><br>
            ${safeText}
        </div>
    `;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

function sendMsg() {
    const i = document.getElementById('m-in');
    const text = i.value.trim();
    if (text && curRoom) {
        socket.emit('send_msg', { 
            room: curRoom, 
            text: text, 
            roomName: curRoomName 
        });
        i.value = "";
    }
}

// ====================== SEARCH & DM ======================
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
        drop.innerHTML = `<div style="padding:15px; color:#666; text-align:center;">No identities found</div>`;
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
            el.innerHTML = `${escapeHTML(user.username)} ${user.isVip ? '<span style="color:#ff00ff;font-size:0.8em">★VIP</span>' : ''}`;
            el.onclick = () => { drop.style.display = 'none'; startDM(user.username); };
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
            el.innerHTML = escapeHTML(group.groupName);
            el.onclick = () => { drop.style.display = 'none'; joinRoom(group.roomId, group.groupName); };
            drop.appendChild(el);
        });
    }
});

function startDM(username) {
    if (username.toLowerCase() === me.toLowerCase()) return showNotify("Self-transmission loop blocked", "SYSTEM", "error");

    const roomId = `DM_${[me.toLowerCase(), username.toLowerCase()].sort().join('_')}`;
    const roomName = username;

    socket.emit('start_dm', { target: username, roomId, roomName });
    document.getElementById('search-drop').style.display = 'none';
}

// ====================== PROFILE MATRIX ======================
function renderUserProfile() {
    let html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1.5rem;">USER PROFILE</h2>
        <div style="text-align:center; margin-bottom:2rem;">
            <div class="avatar-round" style="margin:0 auto; width:90px; height:90px; font-size:2.8rem;">
                ${me ? escapeHTML(me[0].toUpperCase()) : '?'}
            </div>
            <h3 style="margin:1rem 0 0.5rem; color:#fff;">${escapeHTML(me)}</h3>
            <div style="color:${isVipUser ? '#ff00ff' : '#00f2ff'}; font-weight:bold;">
                ${isVipUser ? '★ VIP NODE' : 'STANDARD NODE'}
            </div>
        </div>

        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">UI THEME</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${currentTheme==='cyan'?'active':''}" onclick="changeTheme('cyan')" style="flex:1;">CYAN</button>
                <button class="gate-btn outline ${currentTheme==='amber'?'active':''}" onclick="changeTheme('amber')" style="flex:1;">AMBER</button>
                <button class="gate-btn outline ${currentTheme==='matrix'?'active':''}" onclick="changeTheme('matrix')" style="flex:1;">MATRIX</button>
            </div>
        </div>

        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">PACKET GEOMETRY</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${bubbleStyle==='rect'?'active':''}" onclick="changeBubbleStyle('rect')" style="flex:1;">RECT</button>
                <button class="gate-btn outline ${bubbleStyle==='round'?'active':''}" onclick="changeBubbleStyle('round')" style="flex:1;">ROUND</button>
                <button class="gate-btn outline ${bubbleStyle==='bubble'?'active':''}" onclick="changeBubbleStyle('bubble')" style="flex:1;">BUBBLE</button>
            </div>
        </div>

        ${isVipUser ? `
        <div style="margin:1.5rem 0;">
            <label style="color:var(--neon); font-size:0.85rem;">VIP RESONANCE</label>
            <div style="display:flex; gap:6px; flex-wrap:wrap; margin-top:8px;">
                <button class="gate-btn outline ${vipEffect==='neon'?'active':''}" onclick="changeVipEffect('neon')" style="flex:1;">NEON</button>
                <button class="gate-btn outline ${vipEffect==='fire'?'active':''}" onclick="changeVipEffect('fire')" style="flex:1;">FIRE</button>
                <button class="gate-btn outline ${vipEffect==='pulse'?'active':''}" onclick="changeVipEffect('pulse')" style="flex:1;">PULSE</button>
            </div>
        </div>` : ''}

        <button onclick="logout()" class="gate-btn" style="margin-top:2rem; background:#ff0055; color:white; border:none;">SEVER CONNECTION</button>
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
            <button onclick="closeModal()" style="position:absolute; top:8px; right:15px; background:none; border:none; color:var(--neon); font-size:2.8rem; cursor:pointer;">&times;</button>
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
        else showNotify(`Current Stream: ${curRoomName}`, "Info", "info");
    } else {
        renderUserProfile();
    }
}

function showGlobalInfo() {
    showModal(`<h2 style="color:var(--neon)">GLOBAL CHAT</h2>
        <p style="text-align:center; opacity:0.8; margin-top: 1rem; line-height:1.5;">Main public frequency broadcast channel.<br>All active nodes have access.</p>
        <button class="gate-btn" onclick="closeModal()" style="margin-top: 2rem;">ACKNOWLEDGE</button>`);
}

function logout() {
    localStorage.removeItem('dischat_username');
    localStorage.removeItem('dischat_password');
    location.reload();
}

// ====================== SOCKET EVENT FLOWS ======================
socket.on('login_success', (d) => {
    me = d.username;
    isVipUser = !!d.isVip;
    localStorage.setItem('dischat_username', me);

    // CRITICAL FIX: Explicitly hide onboarding manual and offline layouts if present
    if (document.getElementById('manual-layer')) document.getElementById('manual-layer').style.display = 'none';
    if (document.getElementById('offline-overlay')) document.getElementById('offline-overlay').style.display = 'none';
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0]?.toUpperCase() || '?';

    document.getElementById('cluster-list').innerHTML = '';
    document.getElementById('dm-list').innerHTML = '';

    if (d.groups) d.groups.forEach(renderNode);

    applyTheme(currentTheme);

    // CRITICAL FIX: SMART RECONNCECTION RECOVERY ROUTINE
    // Instead of resetting to global chat, identify if the user was inside a custom room 
    // and re-sync that specific room state to fetch all missed historical chat entries!
    const activeRoomId = curRoom || 'global';
    const activeRoomName = curRoomName || 'GLOBAL CHAT';
    curRoom = ""; // Reset variable memory to bypass identical string blocking logic
    joinRoom(activeRoomId, activeRoomName);

    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
});

socket.on('cluster_joined', g => { 
    renderNode(g); 
    joinRoom(g.roomId, g.groupName); 
});

socket.on('dm_started', g => { 
    renderNode(g); 
    if(g.initiatedByMe) joinRoom(g.roomId, g.groupName); 
});

socket.on('new_msg', m => {
    console.log(`[SYS] Packet received on port [${m.room}] from [${m.sender}]`);

    if (m.room === curRoom) {
        appendMsg(m);
        return;
    }

    let displayName = m.roomName || m.room;
    if (m.room && m.room.startsWith('DM_')) {
        const otherUser = getDMOtherUser(m.room);
        if (otherUser) displayName = otherUser;
    }

    showNotify(
        `you have a message from ${escapeHTML(m.sender)} in ${escapeHTML(displayName)}`, 
        m.isVip ? "VIP DIRECTIVE" : "INCOMING MESSAGE", 
        m.isVip ? "error" : "info", 
        m.room, 
        displayName
    );
});

socket.on('chat_history', logs => {
    document.getElementById('msg-flow').innerHTML = "";
    logs.forEach(appendMsg);
});

socket.on('auth_status', d => {
    const el = document.getElementById('auth-msg');
    el.innerText = `> ${d.m}`;
    el.style.color = d.ok ? 'var(--neon)' : 'var(--danger)';
});

socket.on('notify', d => showNotify(d.m, "SYSTEM", d.type || "info"));

// ====================== CRITICAL FIX: NETWORK RESILIENCE STREAM ======================
socket.on('connect', () => {
    console.log("[NET] Backbone sync established successfully.");
    if (document.getElementById('offline-overlay')) {
        document.getElementById('offline-overlay').style.display = 'none';
    }
    // Triggers auto-reauthentication with stored local authorization keys if tab wakes up
    tryAutoLogin();
});

socket.on('disconnect', () => {
    console.log("[NET] Backbone connection lost.");
    if (document.getElementById('offline-overlay')) {
        document.getElementById('offline-overlay').style.display = 'flex';
    }
});

function toggleSide() {
    document.getElementById('sidebar').classList.toggle('active');
}

window.onload = () => {
    // Note: tryAutoLogin is now safely hooked up to the socket 'connect' event handler
    setTimeout(() => document.getElementById('m-in')?.focus(), 800);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#net-search') && !e.target.closest('#search-drop')) {
            document.getElementById('search-drop').style.display = 'none';
        }
    });

    closeSidebarOnChatClick();
};