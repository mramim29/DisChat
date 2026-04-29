/* ==========================================================================
   BLOCK 0: INITIALIZATION
   ========================================================================== */
const socket = io();
let me = "", activeRoom = "", activeRoomName = "";

// Close search if clicking outside
document.addEventListener('click', (e) => {
    if(!e.target.closest('#main-search')) document.getElementById('search-drop').style.display = 'none';
});

/* ==========================================================================
   BLOCK 1: AUTH & NOTIFICATIONS
   ========================================================================== */
function auth(type) {
    const u = document.getElementById('l-u').value;
    const p = document.getElementById('l-p').value;
    if(u && p) socket.emit(type, { username: u, password: p });
}

function notify(text, title = "SYSTEM") {
    const wrap = document.getElementById('toast-wrap');
    const div = document.createElement('div');
    div.className = "toast";
    div.innerHTML = `<strong>[${title}]</strong><br>${text}`;
    wrap.appendChild(div);
    setTimeout(() => div.remove(), 4000);
}

socket.on('notify', d => notify(d.m, d.type.toUpperCase()));
socket.on('notify_msg', d => notify(`New transmission from ${d.from} in ${d.roomName}`, "MESSAGE"));

socket.on('login_success', d => {
    me = d.username;
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0].toUpperCase();
    if(d.groups) d.groups.forEach(g => renderNode(g));
    joinRoom('global', 'GLOBAL_NET');
});

/* ==========================================================================
   BLOCK 2: UI & SEARCH LOGIC
   ========================================================================== */
function toggleSide() { document.getElementById('sidebar').classList.toggle('active'); }

function doSearch() {
    const q = document.getElementById('main-search').value;
    const drop = document.getElementById('search-drop');
    if(q.length > 0) {
        socket.emit('search_query', q);
        drop.style.display = 'block';
    } else drop.style.display = 'none';
}

socket.on('search_results', d => {
    const drop = document.getElementById('search-drop');
    drop.innerHTML = "";
    d.groups.forEach(g => {
        const div = document.createElement('div');
        div.className = "drop-item";
        div.innerHTML = `[CLUSTER] ${g.groupName} <span style="font-size:0.6rem; color:var(--neon)">(${g.isPublic ? 'PUBLIC' : 'PRIVATE'})</span>`;
        div.onclick = () => { joinCluster(g.roomId, g.groupName); drop.style.display = 'none'; };
        drop.appendChild(div);
    });
    d.users.forEach(u => {
        if(u.username === me) return;
        const div = document.createElement('div');
        div.className = "drop-item";
        div.innerText = `[PEER] ${u.username}`;
        div.onclick = () => { startDM(u.username); drop.style.display = 'none'; };
        drop.appendChild(div);
    });
});

/* ==========================================================================
   BLOCK 3: CHAT ENGINE
   ========================================================================== */
function joinRoom(id, name) {
    activeRoom = id; activeRoomName = name;
    document.getElementById('room-name').innerText = name;
    document.getElementById('msg-wrap').innerHTML = "";
    socket.emit('join_room', id);
    if(window.innerWidth < 768) toggleSide();
}

socket.on('chat_history', logs => logs.forEach(m => appendMsg(m)));
socket.on('new_msg', m => { if(m.room === activeRoom) appendMsg(m); });

function appendMsg(m) {
    const wrap = document.getElementById('msg-wrap');
    const isMe = m.sender === me;
    const div = document.createElement('div');
    div.style.textAlign = isMe ? 'right' : 'left';
    div.innerHTML = `<div style="display:inline-block; max-width:80%; padding:10px; background:${isMe ? 'var(--neon-dim)' : '#111'}; border:1px solid var(--border); margin-bottom:10px;">
        <small style="color:var(--neon)">[${m.sender}]</small><br>${m.text}
    </div>`;
    wrap.appendChild(div);
    const feed = document.getElementById('chat-feed');
    feed.scrollTop = feed.scrollHeight;
}

function sendMsg() {
    const i = document.getElementById('m-input');
    if(i.value.trim()) {
        socket.emit('send_msg', { room: activeRoom, text: i.value, sender: me, roomName: activeRoomName });
        i.value = "";
    }
}

/* ==========================================================================
   BLOCK 4: CLUSTERS & PROFILES
   ========================================================================== */
function renderNode(g) {
    const list = g.isDM ? document.getElementById('dm-list') : document.getElementById('cluster-list');
    if(document.getElementById(`node-${g.roomId}`)) return;
    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "drop-item";
    div.innerText = `[${g.isDM ? 'P' : 'C'}] ${g.groupName}`;
    div.onclick = () => joinRoom(g.roomId, g.groupName);
    list.appendChild(div);
}

function openCreateModal() {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <h2 style="color:var(--neon); margin-bottom:20px;">NEW_CLUSTER</h2>
        <input id="cn" placeholder="CLUSTER_NAME" style="width:100%; padding:12px; background:#000; border:1px solid var(--border); color:var(--neon); margin-bottom:10px;">
        <div style="margin-bottom:15px; font-size:0.8rem;">
            <label><input type="radio" name="cp" value="pub" checked> PUBLIC</label>
            <label style="margin-left:20px;"><input type="radio" name="cp" value="priv"> PRIVATE</label>
        </div>
        <input id="ck" placeholder="PASSKEY (OPTIONAL)" style="width:100%; padding:12px; background:#000; border:1px solid var(--border); color:var(--neon); margin-bottom:20px;">
        <button class="gate-btn" onclick="createGroup()">INITIALIZE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function createGroup() {
    const name = document.getElementById('cn').value;
    const isPub = document.querySelector('input[name="cp"]:checked').value === 'pub';
    const key = document.getElementById('ck').value;
    if(name) socket.emit('create_group', { groupName: name, isPublic: isPub, password: key, creator: me });
    closeModal();
}

socket.on('join_success', g => { renderNode(g); joinRoom(g.roomId, g.groupName); });

function showProfile(type) {
    if(type === 'room' && activeRoom !== 'global') {
        socket.emit('get_group_profile', activeRoom);
    } else {
        const target = type === 'me' ? me : activeRoomName;
        renderProfileModal(target, "USER_OPERATIVE", "N/A");
    }
}

socket.on('group_profile_res', g => {
    renderProfileModal(g.groupName, `CREATOR: ${g.createdBy}`, `DEPLOYED: ${new Date(g.createdAt).toLocaleDateString()}`);
});

function renderProfileModal(name, detail1, detail2) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <div class="profile-round" style="width:80px; height:80px; font-size:2rem; margin:0 auto 20px;">${name[0]}</div>
        <h2 style="color:var(--neon)">${name}</h2>
        <p style="margin:10px 0; font-size:0.8rem;">${detail1}</p>
        <p style="font-size:0.8rem; opacity:0.5;">${detail2}</p>
        <button class="gate-btn outline" style="margin-top:20px;" onclick="closeModal()">CLOSE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function closeModal(e) { if(!e || e.target.id === 'modal-bg' || e.target.innerText === 'CLOSE') document.getElementById('modal-bg').style.display = 'none'; }