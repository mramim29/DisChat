// script.js
const socket = io();

let me = "";
let curRoom = "";
let curRoomName = "";

// ====================== UTILITIES ======================
function showNotify(text, title = "SYSTEM", type = "info") {
    const bin = document.getElementById('toast-bin');
    const toast = document.createElement('div');
    toast.className = `notification-toast ${type}`;
    toast.innerHTML = `<strong style="color:var(--neon)">[${title}]</strong><br>${text}`;
    bin.appendChild(toast);
    setTimeout(() => toast.remove(), 4500);
}

function safeEmit(event, data) {
    if (socket.connected) {
        socket.emit(event, data);
    } else {
        showNotify("Connection lost. Reconnecting...", "ERROR", "error");
    }
}

// ====================== AUTH ======================
function auth(type) {
    const u = document.getElementById('l-u').value.trim();
    const p = document.getElementById('l-p').value.trim();
    if (!u || !p) return showNotify("IDENTITY_ID AND PASSKEY REQUIRED", "ERROR", "error");

    safeEmit(type, { username: u, password: p });
}

// ====================== MODALS (Strict Event Control) ======================
function closeModal(e) {
    const modalBg = document.getElementById('modal-bg');
    if (!e || e.target.id === 'modal-bg') {
        modalBg.style.display = 'none';
    }
}

function openCreateGroupModal() {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1.5rem;">INIT_CLUSTER</h2>
        <input id="new-c-name" class="gate-input" placeholder="CLUSTER_NAME" autocomplete="off">
        <div style="margin:1rem 0; text-align:center;">
            <label><input type="radio" name="c-priv" value="pub" checked> PUBLIC_NODE</label>
            <label style="margin-left:1.5rem;"><input type="radio" name="c-priv" value="priv"> PRIVATE_NODE</label>
        </div>
        <input id="new-c-pass" class="gate-input" type="password" placeholder="PASSKEY (OPTIONAL)">
        <button class="gate-btn" onclick="submitCreateGroup()">ESTABLISH_LINK</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function submitCreateGroup() {
    const name = document.getElementById('new-c-name').value.trim();
    if (!name) return showNotify("CLUSTER NAME REQUIRED", "ERROR", "error");

    const isPublic = document.querySelector('input[name="c-priv"]:checked').value === 'pub';
    const password = document.getElementById('new-c-pass').value.trim();

    safeEmit('create_cluster', { groupName: name, isPublic, password, creator: me });
    closeModal();
}

function openJoinGroupModal(roomId, name) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <h2 style="color:var(--neon); text-align:center;">JOIN: ${name}</h2>
        <p style="text-align:center; margin:1rem 0; font-size:0.85rem;">This node is encrypted.</p>
        <input id="join-c-pass" class="gate-input" type="password" placeholder="ENTER_PASSKEY">
        <button class="gate-btn" onclick="submitJoinGroup('${roomId}')">AUTHORIZE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function submitJoinGroup(roomId) {
    const pass = document.getElementById('join-c-pass').value.trim();
    safeEmit('join_cluster', { roomId, password: pass, username: me });
    closeModal();
}

// ====================== SEARCH ======================
function handleSearch() {
    const q = document.getElementById('net-search').value.trim();
    const drop = document.getElementById('search-drop');
    if (q.length > 0) {
        safeEmit('global_search', q);
        drop.style.display = 'block';
    } else {
        drop.style.display = 'none';
    }
}

socket.on('search_results', (data) => {
    const drop = document.getElementById('search-drop');
    drop.innerHTML = '';

    data.groups.forEach(g => {
        const div = document.createElement('div');
        div.className = "nav-item";
        div.innerHTML = `[CLUSTER] ${g.groupName} <small style="color:var(--neon);float:right;">${g.isPublic ? 'PUB' : 'PRIV'}</small>`;
        div.onclick = () => {
            drop.style.display = 'none';
            document.getElementById('net-search').value = '';
            if (g.isPublic) {
                safeEmit('join_cluster', { roomId: g.roomId, password: "", username: me });
            } else {
                openJoinGroupModal(g.roomId, g.groupName);
            }
        };
        drop.appendChild(div);
    });

    data.users.forEach(u => {
        if (u.username === me) return;
        const div = document.createElement('div');
        div.className = "nav-item";
        div.textContent = `[PEER] ${u.username}`;
        div.onclick = () => {
            const dmRoom = [me, u.username].sort().join('_');
            renderNode({ roomId: dmRoom, groupName: u.username, isDM: true });
            joinRoom(dmRoom, u.username);
            drop.style.display = 'none';
            document.getElementById('net-search').value = '';
        };
        drop.appendChild(div);
    });
});

// ====================== ROOM MANAGEMENT ======================
function joinRoom(id, name) {
    curRoom = id;
    curRoomName = name;

    document.getElementById('active-room').innerText = name;
    document.getElementById('msg-flow').innerHTML = "";

    // Safe room switching
    const currentRooms = Array.from(socket.rooms || []);
    currentRooms.forEach(room => {
        if (room !== socket.id) socket.leave(room);
    });

    socket.emit('join_room', id);

    if (window.innerWidth < 768) toggleSide();
}

function renderNode(g) {
    const container = g.isDM ? document.getElementById('dm-list') : document.getElementById('cluster-list');
    if (document.getElementById(`node-${g.roomId}`)) return;

    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "nav-item";
    div.textContent = `[${g.isDM ? 'P' : 'C'}] ${g.groupName}`;
    div.onclick = () => joinRoom(g.roomId, g.groupName);
    container.appendChild(div);
}

// ====================== CHAT ======================
function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');
    const isMe = m.sender === me;

    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''}`;
    div.innerHTML = `
        <div class="bubble-content">
            <small style="color:var(--neon)">[${m.sender}]</small><br>
            ${m.text}
        </div>
    `;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

function sendMsg() {
    const input = document.getElementById('m-in');
    const text = input.value.trim();

    if (!text || !curRoom) return;

    // Optimistic UI (will be replaced by real message on ack)
    const tempMsg = {
        room: curRoom,
        sender: me,
        text: text,
        timestamp: new Date()
    };
    appendMsg(tempMsg);

    safeEmit('send_msg', {
        room: curRoom,
        roomName: curRoomName,
        text: text,
        sender: me
    });

    input.value = '';
    input.focus();
}

// ====================== PROFILE ======================
function openProfile(type) {
    if (type === 'room' && curRoom.startsWith('CLUSTER')) {
        socket.emit('get_group_meta', curRoom);
    } else {
        const name = type === 'me' ? me : curRoomName;
        renderProfileModal(name, "VERIFIED_OPERATIVE", "STATUS: ONLINE");
    }
}

socket.on('group_meta_res', (g) => {
    renderProfileModal(
        g.groupName,
        `CREATED_BY: ${g.createdBy}`,
        `DEPLOYED: ${new Date(g.createdAt).toLocaleDateString()}`
    );
});

function renderProfileModal(name, d1, d2) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <div class="avatar-round" style="width:90px;height:90px;font-size:2.2rem;margin:0 auto 1.5rem;">
            ${name[0].toUpperCase()}
        </div>
        <h2 style="color:var(--neon); text-align:center;">${name}</h2>
        <p style="margin:1rem 0; text-align:center;">${d1}</p>
        <p style="opacity:0.6; text-align:center; font-size:0.85rem;">${d2}</p>
        <button class="gate-btn outline" onclick="closeModal()">CLOSE_FILE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

// ====================== SOCKET LISTENERS ======================
socket.on('login_success', (data) => {
    me = data.username;
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0].toUpperCase();

    if (data.groups && Array.isArray(data.groups)) {
        data.groups.forEach(g => renderNode(g));
    }

    joinRoom('global', 'GLOBAL_NET');
});

socket.on('auth_status', (d) => {
    const el = document.getElementById('auth-msg');
    el.innerText = `> ${d.m}`;
    el.style.color = d.ok ? 'var(--neon)' : 'var(--danger)';
});

socket.on('cluster_joined', (g) => {
    renderNode(g);
    joinRoom(g.roomId, g.groupName);
    showNotify(`Joined ${g.groupName}`, "SUCCESS");
});

socket.on('chat_history', (logs) => {
    logs.forEach(m => appendMsg(m));
});

socket.on('new_msg', (m) => {
    if (m.room === curRoom) {
        appendMsg(m);
    } else {
        showNotify(`New message from ${m.sender} in ${m.roomName || 'Unknown'}`, "MSG");
    }
});

socket.on('notify', (d) => {
    showNotify(d.m, d.type ? d.type.toUpperCase() : "ALERT", d.type || "info");
});

// Global Enter Key
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && document.activeElement.id === 'm-in') {
        sendMsg();
    }
});

function toggleSide() {
    document.getElementById('sidebar').classList.toggle('active');
}

// Initialize
window.addEventListener('load', () => {
    console.log("%cDISCHAT_OS v2.0 - Production Ready", "color:#00f2ff; font-family:monospace;");
});