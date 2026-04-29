const socket = io();
let me = "", activeRoom = "";

// --- AUTHENTICATION ---
function auth(type) {
    const u = document.getElementById('l-u').value;
    const p = document.getElementById('l-p').value;
    if (u && p) socket.emit(type, { username: u, password: p });
}

socket.on('login_success', d => {
    me = d.username;
    document.getElementById('nav-avatar').innerText = me[0].toUpperCase();
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    
    document.getElementById('private-list').innerHTML = "";
    if (d.groups) d.groups.forEach(g => appendNodeUI(g));
    joinRoom('global', 'GLOBAL_NET');
});

// --- CHAT LOGIC ---
function joinRoom(id, name) {
    activeRoom = id;
    document.getElementById('room-name').innerText = name;
    document.getElementById('msg-wrap').innerHTML = ""; // Clear view for new room
    socket.emit('join_room', id);
}

socket.on('chat_history', logs => {
    logs.forEach(msg => renderMsg(msg));
});

socket.on('new_msg', d => {
    if (d.room === activeRoom) renderMsg(d);
});

function renderMsg(d) {
    const wrap = document.getElementById('msg-wrap');
    const isMe = d.sender === me;
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : 'them'}`;
    div.innerHTML = `
        <small style="color:var(--neon); font-size:0.6rem;">[${d.sender}]</small>
        <div class="bubble-inner">${d.text}</div>
    `;
    wrap.appendChild(div);
    const feed = document.getElementById('chat-container');
    feed.scrollTop = feed.scrollHeight;
}

function send() {
    const i = document.getElementById('m-input');
    if (i.value.trim() && activeRoom) {
        socket.emit('send_msg', { room: activeRoom, text: i.value, sender: me });
        i.value = "";
    }
}

// --- CLUSTER MANAGEMENT ---
function openClusterModal() {
    switchClusterView('join');
    toggleModal('cluster-modal');
}

function switchClusterView(v) {
    document.getElementById('join-view').style.display = v === 'join' ? 'block' : 'none';
    document.getElementById('create-view').style.display = v === 'create' ? 'block' : 'none';
}

function toggleGPass(show) {
    document.getElementById('g-pass').style.display = show ? 'block' : 'none';
}

function createCluster() {
    const name = document.getElementById('g-name').value;
    const isPub = document.querySelector('input[name="privacy"]:checked').value === 'public';
    const pass = document.getElementById('g-pass').value;
    if (name) socket.emit('create_group', { groupName: name, isPublic: isPub, password: pass, creator: me });
}

function joinCluster() {
    const rid = document.getElementById('j-id').value;
    const pass = document.getElementById('j-pass').value;
    socket.emit('join_private_cluster', { username: me, roomId: rid, password: pass });
}

socket.on('join_cluster_res', d => {
    if (d.ok) {
        appendNodeUI(d.payload);
        joinRoom(d.payload.roomId, d.payload.groupName);
        toggleModal('cluster-modal');
    } else alert("ERROR: " + d.m);
});

function appendNodeUI(g) {
    if (document.getElementById(`node-${g.roomId}`)) return;
    const list = document.getElementById('private-list');
    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "node-item";
    div.innerHTML = `<span class="icon">📁</span> ${g.groupName}`;
    div.onclick = () => joinRoom(g.roomId, g.groupName);
    list.appendChild(div);
}

// --- PROFILE VIEW ---
function viewClusterProfile() {
    if (activeRoom === 'global' || activeRoom.includes('_')) return; // Basic filtering
    socket.emit('get_cluster_info', activeRoom);
}

socket.on('cluster_info_res', cluster => {
    document.getElementById('cp-name').innerText = cluster.groupName;
    document.getElementById('cp-id').innerText = `NODE_ID: ${cluster.roomId}`;
    document.getElementById('cp-members').innerHTML = cluster.members.map(m => `<div class="member-tag">> ${m}</div>`).join('');
    toggleModal('cluster-profile-modal');
});

function toggleModal(id) {
    const m = document.getElementById(id);
    m.style.display = (m.style.display === 'flex') ? 'none' : 'flex';
}