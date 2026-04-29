const socket = io();
let me = "", curRoom = "", curRoomName = "";

/* --- 1. AUTHENTICATION & TOASTS --- */
function auth(type) {
    const u = document.getElementById('l-u').value.trim();
    const p = document.getElementById('l-p').value.trim();
    if(u && p) socket.emit(type, { username: u, password: p });
}

function showNotify(text, title = "SYSTEM") {
    const bin = document.getElementById('toast-bin');
    const t = document.createElement('div');
    t.className = 'notification-toast';
    t.innerHTML = `<strong style="color:var(--neon);">[${title}]</strong><br>${text}`;
    bin.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

socket.on('notify', d => showNotify(d.m, d.type ? d.type.toUpperCase() : 'ALERT'));
socket.on('auth_status', d => {
    const el = document.getElementById('auth-msg');
    el.innerText = `> ${d.m}`;
    el.style.color = d.ok ? 'var(--neon)' : 'var(--danger)';
});

socket.on('login_success', d => {
    me = d.username;
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0].toUpperCase();
    if(d.groups) d.groups.forEach(g => renderNode(g));
    joinRoom('global', 'GLOBAL_NET');
});

/* --- 2. SEARCH & DYNAMIC MODALS (NO ALERTS) --- */
function toggleSide() { document.getElementById('sidebar').classList.toggle('active'); }

function handleSearch() {
    const q = document.getElementById('net-search').value.trim();
    const drop = document.getElementById('search-drop');
    if(q) { 
        socket.emit('global_search', q); 
        drop.style.display = 'block'; 
    } else drop.style.display = 'none';
}

socket.on('search_results', d => {
    const drop = document.getElementById('search-drop');
    drop.innerHTML = "";
    
    d.groups.forEach(g => {
        const div = document.createElement('div');
        div.className = "nav-item";
        div.innerHTML = `[CLUSTER] ${g.groupName} <small style="color:var(--neon); float:right;">${g.isPublic?'PUB':'PRIV'}</small>`;
        div.onclick = () => { 
            drop.style.display = 'none';
            document.getElementById('net-search').value = "";
            if(g.isPublic) {
                socket.emit('join_cluster', { roomId: g.roomId, password: "", username: me });
            } else {
                openJoinGroupModal(g.roomId, g.groupName);
            }
        };
        drop.appendChild(div);
    });

    d.users.forEach(u => {
        if(u.username === me) return;
        const div = document.createElement('div');
        div.className = "nav-item";
        div.innerText = `[PEER] ${u.username}`;
        div.onclick = () => { 
            const dmRoom = [me, u.username].sort().join('_');
            joinRoom(dmRoom, u.username);
            renderNode({ roomId: dmRoom, groupName: u.username, isDM: true });
            drop.style.display = 'none';
            document.getElementById('net-search').value = "";
        };
        drop.appendChild(div);
    });
});

/* --- 3. CUSTOM MODAL LOGIC (IN-APP REPLACEMENTS) --- */
function openCreateGroupModal() {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <h2 style="color:var(--neon); margin-bottom:1.5rem; text-align:center;">INIT_CLUSTER</h2>
        <input id="new-c-name" class="gate-input" placeholder="CLUSTER_NAME" autocomplete="off">
        <div style="margin-bottom:1rem; font-size:0.9rem; text-align:center;">
            <label><input type="radio" name="c-priv" value="pub" checked> PUBLIC_NODE</label>
            <label style="margin-left:1.5rem;"><input type="radio" name="c-priv" value="priv"> PRIVATE_NODE</label>
        </div>
        <input id="new-c-pass" class="gate-input" type="password" placeholder="PASSKEY (OPTIONAL)">
        <button class="gate-btn" onclick="submitCreateGroup()">ESTABLISH</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function submitCreateGroup() {
    const name = document.getElementById('new-c-name').value.trim();
    const isPub = document.querySelector('input[name="c-priv"]:checked').value === 'pub';
    const pass = document.getElementById('new-c-pass').value.trim();
    
    if(name) {
        socket.emit('create_cluster', { groupName: name, isPublic: isPub, password: pass, creator: me });
        closeModal(true);
    } else {
        showNotify("CLUSTER NAME REQUIRED", "ERR");
    }
}

function openJoinGroupModal(roomId, name) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <h2 style="color:var(--neon); margin-bottom:1.5rem; text-align:center;">JOIN: ${name}</h2>
        <p style="margin-bottom:1rem; font-size:0.8rem; text-align:center;">NODE IS ENCRYPTED. PASSKEY REQUIRED.</p>
        <input id="join-c-pass" class="gate-input" type="password" placeholder="ENTER_PASSKEY">
        <button class="gate-btn" onclick="submitJoinGroup('${roomId}')">AUTHORIZE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function submitJoinGroup(roomId) {
    const pass = document.getElementById('join-c-pass').value.trim();
    socket.emit('join_cluster', { roomId: roomId, password: pass, username: me });
    closeModal(true);
}

socket.on('cluster_joined', g => { 
    renderNode(g); 
    joinRoom(g.roomId, g.groupName); 
});

/* --- 4. CHAT ENGINE --- */
function joinRoom(id, name) {
    curRoom = id; curRoomName = name;
    document.getElementById('active-room').innerText = name;
    document.getElementById('msg-flow').innerHTML = "";
    socket.emit('join_room', id);
    if(window.innerWidth < 768) toggleSide();
}

socket.on('chat_history', logs => logs.forEach(m => appendMsg(m)));

socket.on('new_msg', m => {
    if(m.room === curRoom) {
        appendMsg(m);
    } else {
        showNotify(`Incoming data from ${m.sender} in ${m.roomName || 'Background Node'}`, 'MSG');
    }
});

function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');
    const isMe = m.sender === me;
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''}`;
    div.innerHTML = `<div class="bubble-content"><small style="color:var(--neon)">[${m.sender}]</small><br>${m.text}</div>`;
    wrap.appendChild(div);
    wrap.scrollTop = wrap.scrollHeight;
}

// Global enter key for message input
document.addEventListener('keypress', (e) => {
    if(e.key === 'Enter' && document.activeElement.id === 'm-in') sendMsg();
});

function sendMsg() {
    const i = document.getElementById('m-in');
    if(i.value.trim() && curRoom) {
        socket.emit('send_msg', { room: curRoom, text: i.value.trim(), sender: me, roomName: curRoomName });
        i.value = "";
        i.focus();
    }
}

/* --- 5. PROFILES & UTILS --- */
function renderNode(g) {
    const list = g.isDM ? document.getElementById('dm-list') : document.getElementById('cluster-list');
    if(document.getElementById(`node-${g.roomId}`)) return;
    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "nav-item";
    div.innerText = `[${g.isDM ? 'P' : 'C'}] ${g.groupName}`;
    div.onclick = () => joinRoom(g.roomId, g.groupName);
    list.appendChild(div);
}

function openProfile(type) {
    if(type === 'room' && curRoom.includes('CLUSTER')) {
        socket.emit('get_group_meta', curRoom);
    } else {
        const name = type === 'me' ? me : curRoomName;
        renderProfileModal(name, "OPERATIVE_VERIFIED", "---");
    }
}

socket.on('group_meta_res', g => {
    renderProfileModal(g.groupName, `CREATED_BY: ${g.createdBy}`, `DEPLOYED: ${new Date(g.createdAt).toLocaleDateString()}`);
});

function renderProfileModal(name, d1, d2) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <div class="avatar-round" style="width:90px; height:90px; font-size:2rem; margin:0 auto 1.5rem;">${name[0]}</div>
        <h2 style="color:var(--neon); text-align:center;">${name}</h2>
        <p style="margin:1rem 0; font-size:0.9rem; text-align:center;">${d1}</p>
        <p style="font-size:0.8rem; opacity:0.5; text-align:center;">${d2}</p>
        <button class="gate-btn outline" onclick="closeModal(true)">CLOSE_FILE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function closeModal(force = false, e) { 
    if(force || (e && e.target.id === 'modal-bg')) {
        document.getElementById('modal-bg').style.display = 'none'; 
    }
}