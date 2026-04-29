const socket = io();
let me = "", curRoom = "", curRoomName = "";

/* --- AUTH --- */
function auth(type) {
    const u = document.getElementById('l-u').value, p = document.getElementById('l-p').value;
    if(u && p) socket.emit(type, { username: u, password: p });
}

socket.on('notify', d => showNotify(d.m, d.type));
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

/* --- UI CONTROLS --- */
function toggleSide() { document.getElementById('sidebar').classList.toggle('active'); }

function handleSearch() {
    const q = document.getElementById('net-search').value;
    const drop = document.getElementById('search-drop');
    if(q) { socket.emit('global_search', q); drop.style.display = 'block'; }
    else drop.style.display = 'none';
}

socket.on('search_results', d => {
    const drop = document.getElementById('search-drop');
    drop.innerHTML = "";
    d.groups.forEach(g => {
        const div = document.createElement('div');
        div.style.padding = "12px"; div.style.cursor = "pointer"; div.style.borderBottom = "1px solid var(--border)";
        div.innerHTML = `[CLUSTER] ${g.groupName} <small style="color:var(--neon)">${g.isPublic?'PUB':'PRIV'}</small>`;
        div.onclick = () => { 
            const pass = g.isPublic ? "" : prompt("NODE_PASSKEY:");
            socket.emit('join_cluster', { roomId: g.roomId, password: pass, username: me });
            drop.style.display = 'none';
        };
        drop.appendChild(div);
    });
});

/* --- CHAT ENGINE --- */
function joinRoom(id, name) {
    curRoom = id; curRoomName = name;
    document.getElementById('active-room').innerText = name;
    document.getElementById('msg-flow').innerHTML = "";
    socket.emit('join_room', id);
    if(window.innerWidth < 768) toggleSide();
}

socket.on('new_msg', m => {
    if(m.room === curRoom) {
        const wrap = document.getElementById('msg-flow');
        const isMe = m.sender === me;
        const div = document.createElement('div');
        div.style.textAlign = isMe ? 'right' : 'left';
        div.style.marginBottom = "15px";
        div.innerHTML = `<div style="display:inline-block; max-width:80%; padding:12px; background:${isMe?'var(--neon-dim)':'#111'}; border:1px solid var(--border);">
            <small style="color:var(--neon)">[${m.sender}]</small><br>${m.text}
        </div>`;
        wrap.appendChild(div);
        wrap.scrollTop = wrap.scrollHeight;
    } else {
        showNotify(`Message from ${m.sender} in ${m.roomName}`, 'MSG');
    }
});

function sendMsg() {
    const i = document.getElementById('m-in');
    if(i.value.trim()) {
        socket.emit('send_msg', { room: curRoom, text: i.value, sender: me, roomName: curRoomName });
        i.value = "";
    }
}

/* --- PROFILES & NOTIFICATIONS --- */
function openProfile(type) {
    if(type === 'room' && curRoom.includes('CLUSTER')) {
        socket.emit('get_group_meta', curRoom);
    } else {
        renderModal(type === 'me' ? me : curRoomName, "OPERATIVE_ID_VERIFIED", "---");
    }
}

socket.on('group_meta_res', g => {
    renderModal(g.groupName, `CREATED_BY: ${g.createdBy}`, `DEPLOYED: ${new Date(g.createdAt).toLocaleDateString()}`);
});

function renderModal(name, d1, d2) {
    const box = document.getElementById('modal-box');
    box.innerHTML = `
        <div style="width:70px; height:70px; border-radius:50%; border:2px solid var(--neon); margin:0 auto 20px; display:flex; align-items:center; justify-content:center; font-size:1.5rem;">${name[0]}</div>
        <h2 style="color:var(--neon)">${name}</h2>
        <p style="margin:10px 0; font-size:0.8rem;">${d1}</p>
        <p style="font-size:0.7rem; opacity:0.5;">${d2}</p>
        <button class="gate-btn outline" onclick="closeModal()">CLOSE</button>
    `;
    document.getElementById('modal-bg').style.display = 'flex';
}

function showNotify(text, title) {
    const bin = document.getElementById('toast-bin');
    const t = document.createElement('div');
    t.className = 'notification-toast';
    t.innerHTML = `<strong>[${title}]</strong><br>${text}`;
    bin.appendChild(t);
    setTimeout(() => t.remove(), 4000);
}

function closeModal() { document.getElementById('modal-bg').style.display = 'none'; }