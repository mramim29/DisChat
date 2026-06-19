const socket = io();
let me = "";
let curRoom = "";
let curRoomName = "";
let isVipUser = false;
let currentTheme = localStorage.getItem('dischat-theme') || 'cyan';
let bubbleStyle = localStorage.getItem('dischat-bubble') || 'bubble';
let currentFont = localStorage.getItem('dischat-font') || 'jetbrains-mono';
let vipEffect = localStorage.getItem('dischat-vipeffect') || 'neon';

let roomTimestamps = {};
let currentReplyTarget = null;
let pendingDeepLinkRoom = null;
let pendingDeepLinkName = null;
let onlineUsersMap = {};
let roomOnlineUsers = {};
let lastDisplayedDate = null;

const THEMES = {
    cyan: {
        '--neon': '#00f2ff',
        '--neon-dim': 'rgba(0, 242, 255, 0.15)',
        '--bg-primary': '#050608',
        '--bg-secondary': '#0d1117',
        '--bg-tertiary': '#080a0f',
        '--bg-input': '#000',
        '--bg-hover': 'rgba(0, 242, 255, 0.08)',
        '--text-primary': '#c9d1d9',
        '--text-secondary': '#8b949e',
        '--text-muted': '#555',
        '--text-inverse': '#000',
        '--border': '#1a212a',
        '--border-light': 'rgba(255,255,255,0.06)',
        '--reaction-bg': '#161b22',
        '--reaction-text': '#c9d1d9',
        '--reaction-border': '#1a212a'
    },
    soft: {
        '--neon': '#f7a1c4',
        '--neon-dim': 'rgba(247, 161, 196, 0.2)',
        '--bg-primary': '#fdf6f0',
        '--bg-secondary': '#fffaf5',
        '--bg-tertiary': '#f5ede7',
        '--bg-input': '#ffffff',
        '--bg-hover': 'rgba(247, 161, 196, 0.1)',
        '--text-primary': '#3d2c2a',
        '--text-secondary': '#7a5a55',
        '--text-muted': '#b09893',
        '--text-inverse': '#ffffff',
        '--border': '#e6d3cd',
        '--border-light': 'rgba(247, 161, 196, 0.15)',
        '--reaction-bg': '#f0e0db',
        '--reaction-text': '#3d2c2a',
        '--reaction-border': '#d4bdb6'
    },
    ocean: {
        '--neon': '#4fc3f7',
        '--neon-dim': 'rgba(79, 195, 247, 0.2)',
        '--bg-primary': '#0a1a2b',
        '--bg-secondary': '#112b3f',
        '--bg-tertiary': '#0d2233',
        '--bg-input': '#05131f',
        '--bg-hover': 'rgba(79, 195, 247, 0.08)',
        '--text-primary': '#d4e6f5',
        '--text-secondary': '#8db3cc',
        '--text-muted': '#4d6b80',
        '--text-inverse': '#0a1a2b',
        '--border': '#1d3d55',
        '--border-light': 'rgba(79, 195, 247, 0.06)',
        '--reaction-bg': '#1a3345',
        '--reaction-text': '#d4e6f5',
        '--reaction-border': '#2a4d66'
    },
    midnight: {
        '--neon': '#7c4dff',
        '--neon-dim': 'rgba(124, 77, 255, 0.2)',
        '--bg-primary': '#07050f',
        '--bg-secondary': '#100d1f',
        '--bg-tertiary': '#0c0817',
        '--bg-input': '#03020a',
        '--bg-hover': 'rgba(124, 77, 255, 0.08)',
        '--text-primary': '#d4ccf5',
        '--text-secondary': '#8a7acc',
        '--text-muted': '#4d3d80',
        '--text-inverse': '#07050f',
        '--border': '#1d1a4d',
        '--border-light': 'rgba(124, 77, 255, 0.06)',
        '--reaction-bg': '#1a1433',
        '--reaction-text': '#d4ccf5',
        '--reaction-border': '#2a224d'
    }
};
const FONT_MAP = {
    'jetbrains-mono': "'JetBrains Mono', monospace",
    'caveat': "'Caveat', cursive",
    'inter': "'Inter', sans-serif",
    'space-grotesk': "'Space Grotesk', sans-serif",
    'chelsea-market': "'Chelsea Market', cursive",  
    'trispace': "'Trispace', sans-serif"            
};
function applyFont(fontKey) {
    const fontFamily = FONT_MAP[fontKey] || FONT_MAP['jetbrains-mono'];
    document.documentElement.style.setProperty('--font-family', fontFamily);
    currentFont = fontKey;
    localStorage.setItem('dischat-font', fontKey);

    // Set data attribute for Caveat-specific styling
    if (fontKey === 'caveat') {
        document.body.setAttribute('data-font', 'caveat');
    } else {
        document.body.removeAttribute('data-font');
    }
}

function changeFont(fontKey) {
    applyFont(fontKey);
    renderUserProfile();
}


//DELIVERY STATUS
const DELIVERY_STATUS = {
    SENDING: 'sending',
    SENT: 'sent',
    DELIVERED: 'delivered',
    READ: 'read'
};

// Map to track message delivery status by msgId
let msgStatusMap = {};
//NOTIFICATION & AUDIO SETUP
const notificationSound = document.getElementById('notification-sound');


//AUTO-READ MESSAGES ON SCROLL 
let readObserver = null;

function setupReadTracking() {
    const chatFlow = document.getElementById('msg-flow');
    if (!chatFlow) return;

    // Create an Intersection Observer to detect when messages are visible
    readObserver = new IntersectionObserver((entries) => {
        const visibleMsgIds = [];
        
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const msgEl = entry.target;
                const msgId = msgEl.id?.replace('msg-', '');
                if (msgId && msgEl.classList.contains('me') === false) {
                    // Only mark messages FROM OTHER USERS as read
                    visibleMsgIds.push(msgId);
                }
            }
        });

        if (visibleMsgIds.length > 0) {
            // Batch send read receipts
            socket.emit('room_messages_read', {
                roomId: curRoom,
                messageIds: visibleMsgIds
            });
        }
    }, {
        threshold: 0.5, // Message must be 50% visible
        root: chatFlow
    });

    // Observe all existing messages
    chatFlow.querySelectorAll('.msg-bubble:not(.me)').forEach(el => {
        readObserver.observe(el);
    });

    // Also observe new messages via MutationObserver
    const mutationObserver = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            mutation.addedNodes.forEach(node => {
                if (node.classList && node.classList.contains('msg-bubble') && 
                    !node.classList.contains('me')) {
                    readObserver.observe(node);
                }
            });
        });
    });

    mutationObserver.observe(chatFlow, {
        childList: true,
        subtree: false
    });
}
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

// UTILITIES 
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

function showNotify(text, title = "SYSTEM", type = "info", roomId = null, roomName = null, sender = null) {
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
    
    // --- AUTO-DISMISS AFTER 1 SECOND ---
    setTimeout(() => {
        if (t.parentNode === bin) bin.removeChild(t);
    }, 1000);

    const shouldNotify = 
        document.visibilityState !== 'visible' || 
        (roomId && roomId !== curRoom);

    const isOwnMessage = sender && sender.toLowerCase() === me.toLowerCase();

    if (shouldNotify && !isOwnMessage) {
        playNotificationSound();
        showSystemNotification(title, text, roomId, roomName);
    }
}

//MANUAL & ONBOARDING FLOW
function enterAuthentication() {
    document.getElementById('manual-layer').style.display = 'none';
    document.getElementById('auth-layer').style.display = 'flex';
}

function showUserManualModal() {
    const html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1.5rem;">USER_MANUAL</h2>
        <div style="font-size:0.9rem; line-height:1.6; text-align:left; max-height:55vh; overflow-y:auto; padding-right:8px; color:var(--text-primary);">
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

//AUTH
function auth(type) {
    let u, p;
    let msgEl;
    
    if (type === 'login') {
        u = document.getElementById('l-u').value.trim();
        p = document.getElementById('l-p').value.trim();
        msgEl = document.getElementById('auth-msg');
    } else if (type === 'register') {
        u = document.getElementById('reg-u').value.trim();
        p = document.getElementById('reg-p').value.trim();
        msgEl = document.getElementById('reg-msg');
    }
    
    if (!u || !p) {
        if (msgEl) msgEl.innerText = '❌ Please fill in all fields.';
        return;
    }
    
    // Emit the event
    socket.emit(type, { username: u, password: p });
    
    if (type === 'login') {
        localStorage.setItem('dischat_username', u);
        localStorage.setItem('dischat_password', p);
    }
}

// Switch between login and register panels
function switchAuthPanel(panel) {
    const loginPanel = document.getElementById('login-panel');
    const registerPanel = document.getElementById('register-panel');
    const authMsg = document.getElementById('auth-msg');
    const regMsg = document.getElementById('reg-msg');
    
    // Clear messages
    if (authMsg) authMsg.innerText = '';
    if (regMsg) regMsg.innerText = '';
    
    if (panel === 'login') {
        loginPanel.style.display = 'block';
        registerPanel.style.display = 'none';
        document.getElementById('l-u')?.focus();
    } else {
        loginPanel.style.display = 'none';
        registerPanel.style.display = 'block';
        document.getElementById('reg-u')?.focus();
    }
}
function tryAutoLogin() {
    const savedUsername = localStorage.getItem('dischat_username');
    const savedPassword = localStorage.getItem('dischat_password');
    
    if (savedUsername && savedPassword) {
        socket.emit('login', { username: savedUsername, password: savedPassword });
    }
}

//CREATE CLUSTER 
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

//HELPER
function getDMOtherUser(roomId) {
    if (!roomId || !roomId.startsWith('DM_')) return null;
    const parts = roomId.split('_').slice(1);
    return parts.find(u => u.toLowerCase() !== me.toLowerCase()) || null;
}

//RENDER NODE
// RENDER NODE (CLEAN STREAMLINE OPTIMIZATION)
function renderNode(g) {
    const list = g.isDM ? document.getElementById('dm-list') : document.getElementById('cluster-list');
    if (document.getElementById(`node-${g.roomId}`)) return;

    const div = document.createElement('div');
    div.id = `node-${g.roomId}`;
    div.className = "nav-item";
    
    if (!roomTimestamps[g.roomId]) {
        roomTimestamps[g.roomId] = g.lastTimestamp || Date.now();
    }

    let displayName = g.groupName;
    if (g.isDM) {
        const other = getDMOtherUser(g.roomId);
        if (other) displayName = other;
    }

    div.innerHTML = `
    <span class="nav-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold; display: flex; align-items: center;">
        ${displayName}
        <span id="dot-placeholder-${g.roomId}" style="margin-left: auto;"></span>
    </span>
    <div id="preview-${g.roomId}" class="nav-preview">No transmissions yet</div>
    `;

    div.onclick = () => joinRoom(g.roomId, displayName);
    list.appendChild(div);
    
    updatePresenceIndicators(g.roomId);
    updateSidebarSorting(g.roomId);
}

function joinRoom(id, name) {
    if (curRoom === id) return;

    curRoom = id;
    curRoomName = name || id;

    // Reset day dividers for the new room
    document.getElementById('msg-flow').innerHTML = "";
    lastDisplayedDate = null;

    // ---- Update header with room name + online status ----
    // ---- Update header with room name + online status ----
const headerEl = document.getElementById('active-room');

// Clear and create room name span
headerEl.innerHTML = '';
const roomNameSpan = document.createElement('span');
roomNameSpan.textContent = curRoomName;
roomNameSpan.style.flexShrink = '1';
roomNameSpan.style.overflow = 'hidden';
roomNameSpan.style.textOverflow = 'ellipsis';
roomNameSpan.style.whiteSpace = 'nowrap';
headerEl.appendChild(roomNameSpan);

let statusText = '';
let statusColor = '#666';
if (id.startsWith('DM_')) {
    const other = getDMOtherUser(id);
    if (other) {
        const isOnline = roomOnlineUsers[id]?.includes(other.toLowerCase()) || false;
        statusText = isOnline ? '● ONLINE' : '○ OFFLINE';
        statusColor = isOnline ? '#00ff41' : '#666';
    }
} else if (id.startsWith('CLUSTER_')) {
    const onlineCount = (roomOnlineUsers[id] || []).length;
    statusText = onlineCount > 0 ? `● ${onlineCount} ONLINE` : '○ 0 ONLINE';
    statusColor = '#00ff41';
}
if (statusText) {
    const statusSpan = document.createElement('span');
    statusSpan.className = 'room-status-badge';
    statusSpan.textContent = statusText;
    statusSpan.style.color = statusColor;
    headerEl.appendChild(statusSpan);
}

    // Clear unread snippet highlight states
    const targetPreview = document.getElementById(`preview-${id}`);
    if (targetPreview) targetPreview.style.color = '#666';

    //DUEL btn
    const actionContainer = document.getElementById('header-actions');
if (actionContainer) {
    if (id.startsWith('CLUSTER_')) {
        actionContainer.innerHTML = `
            <button class="gate-btn outline header-btn" onclick="promptClusterInvite()" style="margin: 0 8px 0 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; display: inline-block;">
               [+ ADD PEOPLE]
            </button>
            <button class="gate-btn outline" onclick="openTTTConfigModal()" style="margin: 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; border-color: var(--neon); color: var(--neon); display: inline-block;">
                [⚔️DUEL]
            </button>
        `;
        actionContainer.style.display = 'block';
    } else if (id.startsWith('DM_')) {
        actionContainer.innerHTML = `
            <button class="gate-btn outline" onclick="openTTTConfigModal()" style="margin: 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; border-color: var(--neon); color: var(--neon);">
                [⚔️DUEL]
            </button>
        `;
        actionContainer.style.display = 'block';
    } else {
        actionContainer.style.display = 'none';
    }
}

    // Join the room via socket
    socket.emit('join_room', id);
    
    // Auto-close sidebar on mobile
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


            // ==================== TIMESTAMP HELPERS ====================
function formatMessageTime(timestamp) {
    const date = new Date(timestamp);
    let hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    return `${hours}:${minutes} ${ampm}`;
}

function formatDayDivider(timestamp) {
    const now = new Date();
    const date = new Date(timestamp);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const msgDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

    if (msgDate.getTime() === today.getTime()) return 'Today';
    if (msgDate.getTime() === yesterday.getTime()) return 'Yesterday';
    
    return date.toLocaleDateString('en-US', { 
        month: 'long', 
        day: 'numeric', 
        year: 'numeric' 
    });
}

            //APPEND MESSAGE
function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');

    // Guard against missing timestamp
    if (!m.timestamp) m.timestamp = new Date().toISOString();

    const timeStr = formatMessageTime(m.timestamp);
    const currentDayKey = new Date(m.timestamp).toDateString();

    // ==================== DAY DIVIDER ====================
    if (currentDayKey !== lastDisplayedDate) {
        const divider = document.createElement('div');
        divider.className = 'day-divider';
        const dayText = formatDayDivider(m.timestamp);
        divider.innerHTML = `<span>${dayText}</span>`;
        wrap.appendChild(divider);
        lastDisplayedDate = currentDayKey;
    }

    // ==================== TIC TAC TOE GAME NODE ====================
    if (m.type === "TICTACTOE") {
        const gameDiv = document.createElement('div');
        gameDiv.className = "centered-game-matrix-node";
        gameDiv.id = `game-node-${m.matchId}`;
        
        let savedState = null;
        if (m.text && m.text.startsWith('{')) {
            try { savedState = JSON.parse(m.text); } catch(e) { savedState = null; }
        }

        gameDiv.innerHTML = `
            <div class="ttt-scoreboard-frame">
                <div class="ttt-system-title">TIC TAC TOE</div>
                <div class="ttt-status-banner" id="ttt-status-${m.matchId}">LOADING...</div>
                <div class="ttt-core-grid" id="ttt-grid-${m.matchId}">
                    ${Array(9).fill(0).map((_, idx) => {
                        let sign = (savedState && savedState.board) ? savedState.board[idx] : "";
                        let disabledAttr = sign ? 'disabled class="ttt-cell occupied ' + sign.toLowerCase() + '"' : 'class="ttt-cell"';
                        return `<button ${disabledAttr} onclick="submitGameMove('${m.matchId}', ${idx})" id="cell-${m.matchId}-${idx}">${sign}</button>`;
                    }).join('')}
                </div>
            </div>
        `;
        wrap.appendChild(gameDiv);

        if (savedState) {
            setTimeout(() => {
                const banner = document.getElementById(`ttt-status-${m.matchId}`);
                if (!banner) return;
                
                const cleanMe = me.toLowerCase();
                const pX = savedState.playerX.toLowerCase();
                const pO = savedState.playerO.toLowerCase();

                if (savedState.status === "ACTIVE") {
                    if (pO === "enclave_challenger") {
                        banner.innerText = `AWAITING CHALLENGER...`;
                        banner.style.color = "#ffcc00";
                    } else if (cleanMe !== pX && cleanMe !== pO) {
                        disableAllMatchCells(m.matchId);
                        banner.innerText = `WATCHING: @${pX.toUpperCase()} VS @${pO.toUpperCase()}`;
                        banner.style.color = "var(--text-secondary)";
                    } else {
                        const activeUser = savedState.turn === "X" ? savedState.playerX : savedState.playerO;
                        banner.innerText = `TURN: @${activeUser.toUpperCase()} (${savedState.turn})`;
                        banner.style.color = "var(--neon)";
                    }
                } else if (savedState.status === "DRAW") {
                    banner.innerText = `STATUS: ENGAGEMENT DRAW`;
                    banner.style.color = "var(--text-secondary)";
                    disableAllMatchCells(m.matchId);
                } else if (savedState.status === "WON") {
                    if (cleanMe === pX || cleanMe === pO) {
                        const isWinnerMe = savedState.winner.toLowerCase() === cleanMe;
                        banner.innerText = isWinnerMe ? `STATUS: YOU WON` : `STATUS: YOU LOST`;
                        banner.style.color = isWinnerMe ? "#00ff41" : "var(--danger)";
                    } else {
                        banner.innerText = `MATCH OVER: @${savedState.winner.toUpperCase()} WINS!`;
                        banner.style.color = "#ffcc00";
                    }
                    disableAllMatchCells(m.matchId);
                } else if (savedState.status === "TIMEOUT") {
                    banner.innerText = "DUEL CANCELLED: TIMEOUT";
                    banner.style.color = "var(--danger)";
                    disableAllMatchCells(m.matchId);
                }
            }, 50);
        }
        
        wrap.scrollTop = wrap.scrollHeight;
        return;
    }

    // ==================== SYSTEM MESSAGES ====================
    if (m.sender === "SYSTEM") {
        const sysDiv = document.createElement('div');
        sysDiv.className = "system-broadcast-badge";
        sysDiv.innerHTML = `<span>${escapeHTML(m.text)}</span>`;
        wrap.appendChild(sysDiv);
        wrap.scrollTop = wrap.scrollHeight;
        return;
    }

    const isMe = m.sender.toLowerCase() === me.toLowerCase();
    const vipClass = m.isVip ? `vip-message vip-${vipEffect}` : '';
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''} ${bubbleStyle} ${vipClass}`;
    div.id = `msg-${m._id}`;

    const vipTag = m.isVip ? ' ★VIP' : '';
    const safeSender = escapeHTML(m.sender);
    const safeText = escapeHTML(m.text);

    // ==================== REPLY QUOTE ====================
    let replyQuoteHTML = '';
    if (m.replyTo) {
        replyQuoteHTML = `
            <div class="nested-reply-quote" onclick="scrollToTargetMessage('${m.replyTo.msgId}')">
                <small style="color:var(--neon); font-weight:bold;">@${escapeHTML(m.replyTo.sender)}</small>
                <div class="reply-quote-text-snippet">${escapeHTML(m.replyTo.text)}</div>
            </div>
        `;
    }

    // ==================== BUBBLE HTML ====================
    div.innerHTML = `
        <button class="desktop-reply-action-shortcut" onclick="initiateReplySequence('${m._id}', '${safeSender}', '${safeText}')" title="Reply to transmission">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 14L4 9L9 4M4 9H14C17.866 9 21 12.134 21 16V20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </button>

        <div class="reaction-trigger-zone">
            <span class="react-btn" onclick="submitReaction('${m._id}', '👍')">👍</span>
            <span class="react-btn" onclick="submitReaction('${m._id}', '🔥')">🔥</span>
            <span class="react-btn" onclick="submitReaction('${m._id}', '😂')">😂</span>
            <span class="react-btn" onclick="submitReaction('${m._id}', '😮')">😮</span>
            <span class="react-btn" onclick="submitReaction('${m._id}', '😢')">😢</span>
            <span class="react-btn add-more-reactions-trigger" onclick="openEmojiPickerModal('${m._id}')" style="color: var(--neon); font-family: 'JetBrains Mono', monospace; font-weight: bold; padding-left: 2px;">+</span>
        </div>

        <div class="bubble-content-swipe-container">
            <div class="bubble-content">
                <!-- SENDER LABEL -->
                <div class="msg-sender" style="font-weight:bold; color:var(--neon); font-size:0.85rem; margin-bottom:3px;">
                    ${safeSender}${vipTag}
                </div>

                ${replyQuoteHTML}

                <!-- TEXT + TIMESTAMP (inline) -->
                    <div class="msg-text-wrapper">
                        <span class="msg-text-payload">${safeText}</span>
                        <span class="msg-meta-wrapper">
                          <span class="msg-timestamp">${timeStr}</span>
                          <span class="msg-status-icon">${isMe ? '✓' : ''}</span>
                          </span>
                    </div>

                <div class="reaction-tray" id="react-tray-${m._id}"></div>
            </div>
            <div class="swipe-reply-indicator-icon">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M9 14L4 9L9 4M4 9H14C17.866 9 21 12.134 21 16V20" stroke="var(--neon)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
            </div>
        </div>
    `;

    wrap.appendChild(div);
    renderReactionBadges(m._id, m.reactions || []);

    // ==================== DELIVERY STATUS TRACKING ====================
    if (isMe && m._id) {
        msgStatusMap[m._id] = {
            delivered: m.delivered || [],
            read: m.read || []
        };
        setTimeout(() => updateMessageStatus(m._id), 100);
    }

    if (!isMe && m._id && m.sender.toLowerCase() !== me.toLowerCase()) {
        socket.emit('message_delivered', { msgId: m._id });
    }

    // ==================== MOBILE SWIPE-TO-REPLY ====================
    let touchTimer = null;
    let isLongPress = false; 
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    const swipeContainer = div.querySelector('.bubble-content-swipe-container');
    const bubbleContent = div.querySelector('.bubble-content');
    const triggerZone = div.querySelector('.reaction-trigger-zone');

    if (swipeContainer && bubbleContent && triggerZone) {
        
        swipeContainer.addEventListener('touchstart', (e) => {
            startX = e.touches[0].clientX;
            isSwiping = false;
            isLongPress = false;

            touchTimer = setTimeout(() => {
                if (!isSwiping) {
                    isLongPress = true;
                    document.querySelectorAll('.reaction-trigger-zone').forEach(zone => {
                        if (zone !== triggerZone) zone.style.display = 'none';
                    });
                    triggerZone.style.display = 'flex';
                    if (navigator.vibrate) navigator.vibrate(30);
                }
            }, 500);
        }, { passive: true });

        swipeContainer.addEventListener('touchmove', (e) => {
            currentX = e.touches[0].clientX;
            const diffX = currentX - startX;

            if (diffX > 10 && !isLongPress) {
                isSwiping = true;
                clearTimeout(touchTimer);
                
                const translateAmt = Math.min(diffX, 70); 
                bubbleContent.style.transform = `translateX(${translateAmt}px)`;
                
                const indicator = swipeContainer.querySelector('.swipe-reply-indicator-icon');
                if (indicator) {
                    indicator.style.opacity = Math.min(diffX / 50, 1);
                    indicator.style.transform = `translateY(-50%) scale(${Math.min(diffX / 50, 1)})`;
                }
            }
        }, { passive: true });

        swipeContainer.addEventListener('touchend', (e) => {
            clearTimeout(touchTimer);
            const diffX = currentX - startX;

            if (isSwiping) {
                if (diffX > 55) {
                    initiateReplySequence(m._id, m.sender, m.text);
                    if (navigator.vibrate) navigator.vibrate([15, 10, 15]);
                }
                
                bubbleContent.style.transition = "transform 0.25s ease";
                bubbleContent.style.transform = "translateX(0px)";
                
                const indicator = swipeContainer.querySelector('.swipe-reply-indicator-icon');
                if (indicator) {
                    indicator.style.transition = "opacity 0.2s, transform 0.2s";
                    indicator.style.opacity = "0";
                    indicator.style.transform = "translateY(-50%) scale(0.4)";
                }

                setTimeout(() => {
                    bubbleContent.style.removeProperty('transition');
                    if (indicator) indicator.style.removeProperty('transition');
                }, 260);
            }
        }, { passive: true });

        bubbleContent.addEventListener('click', (e) => {
            if (triggerZone.style.display === 'flex' || isLongPress || isSwiping) {
                e.preventDefault();
                e.stopPropagation();
            }
        }, { capture: true });
    }

    wrap.scrollTop = wrap.scrollHeight;
}
function sendMsg() {
    const i = document.getElementById('m-in');
    const text = i.value.trim();
    if (text && curRoom) {
        const payload = { 
            room: curRoom, 
            text: text, 
            roomName: curRoomName 
        };
        
        // Attach references if a reply choice is currently queued up
        if (currentReplyTarget) {
            payload.replyTo = currentReplyTarget;
        }

        socket.emit('send_msg', payload);
        i.value = "";
        clearActiveReplySequence(); // Close tracking bar view state on message transmit
    }
}

//SEARCH & DM
function handleSearch() {
    const query = document.getElementById('net-search').value.trim();
    const drop = document.getElementById('search-drop');
    if (query.length < 2) {
        drop.style.display = 'none';
        return;
    }
    socket.emit('global_search', query);
}
function updateRoomHeader(roomId) {
    if (roomId !== curRoom) return;
    const headerEl = document.getElementById('active-room');
    if (!headerEl) return;

    const onlineList = roomOnlineUsers[roomId] || [];
    const onlineCount = onlineList.length;

    if (roomId.startsWith('DM_')) {
        const other = getDMOtherUser(roomId);
        const isOnline = onlineList.includes(other?.toLowerCase());
        headerEl.innerHTML = `${curRoomName} <span style="color:${isOnline ? '#00ff41' : '#666'}; font-size:0.65rem; margin-left:10px; font-weight:bold;">${isOnline ? '● ONLINE' : '○ OFFLINE'}</span>`;
    } else if (roomId.startsWith('CLUSTER_')) {
        headerEl.innerHTML = `${curRoomName} <span style="color:#00ff41; font-size:0.65rem; margin-left:10px; font-weight:bold;">${onlineCount > 0 ? `● ${onlineCount} ONLINE` : '○ 0 ONLINE'}</span>`;
    }
}


//UPDATE MESSAGE STATUS IN UI
function updateMessageStatus(msgId) {
    const msgEl = document.getElementById(`msg-${msgId}`);
    if (!msgEl) return;
    
    const statusEl = msgEl.querySelector('.msg-status-icon');
    if (!statusEl) return;
    
    const status = msgStatusMap[msgId];
    if (!status) return;
    
    const isOwnMessage = msgEl.classList.contains('me');
    if (!isOwnMessage) {
        // Only show delivery status on OWN messages
        return;
    }
    
    // Determine which icon to show
    let icon = '';
    let title = '';
    
    // Check if read by at least one other person
    const readByOthers = status.read.filter(u => u.toLowerCase() !== me.toLowerCase());
    if (readByOthers.length > 0) {
        icon = '✓✓';
        title = 'Read';
    } 
    // Check if delivered to at least one other person
    else {
        const deliveredToOthers = status.delivered.filter(u => u.toLowerCase() !== me.toLowerCase());
        if (deliveredToOthers.length > 0) {
            icon = '✓✓';
            title = 'Delivered';
        } else {
            icon = '✓';
            title = 'Sent';
        }
    }
    
    statusEl.textContent = icon;
    statusEl.title = title;
    statusEl.style.color = icon === '✓✓' ? '#00ff41' : '#888';
}
//UNIFIED SEARCH INTENT ROUTER ENGINE
socket.on('search_results', ({ users, groups }) => {
    // 1. Check if the Tic Tac Toe duel config dropdown is currently on-screen
    const duelDrop = document.getElementById('ttt-duel-search-drop');
    const isGameSearch = duelDrop && window.getComputedStyle(document.getElementById('ttt-target-filter-bay') || {}).display !== 'none';

    if (isGameSearch) {
        // ROUTE A: Handle updates intended for the Tic Tac Toe Duel Configuration Form
        duelDrop.innerHTML = '';
        duelDrop.style.display = 'block';

        if (!users || users.length === 0) {
            duelDrop.innerHTML = `<div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">No matching nodes</div>`;
            return;
        }

        users.forEach(u => {
            if (u.username.toLowerCase() === me.toLowerCase()) return; 

            const div = document.createElement('div');
            div.className = 'nav-item';
            div.style.padding = '8px 12px';
            div.style.fontSize = '0.85rem';
            div.style.cursor = 'pointer';
            div.textContent = u.username;

            div.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const searchInput = document.getElementById('ttt-duel-search');
                const hiddenTarget = document.getElementById('ttt-final-target-user');

                if (searchInput) searchInput.value = u.username.toUpperCase();
                if (hiddenTarget) {
                    hiddenTarget.value = u.username.toLowerCase();
                    console.log(`[TTT_SYSTEM] Target assigned: ${hiddenTarget.value}`);
                }

                duelDrop.style.display = 'none';
            };
            duelDrop.appendChild(div);
        });
        return; // Terminate execution pass so it doesn't leak into sidebar layout logic
    }

    // ROUTE B: Fallback to your standard Main App Sidebar Search layout tracking
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

//DELIVERY & READ EVENTS 

// Receive delivery updates (someone received our message)
socket.on('delivery_update', ({ msgId, delivered, read }) => {
    console.log(`[DELIVERY] Message ${msgId} delivered to:`, delivered);
    
    if (msgId && msgStatusMap[msgId]) {
        msgStatusMap[msgId].delivered = delivered;
        msgStatusMap[msgId].read = read;
        updateMessageStatus(msgId);
    }
});

// Receive read updates (someone read our message)
socket.on('read_update', ({ msgId, delivered, read }) => {
    console.log(`[READ] Message ${msgId} read by:`, read);
    
    if (msgId && msgStatusMap[msgId]) {
        msgStatusMap[msgId].delivered = delivered;
        msgStatusMap[msgId].read = read;
        updateMessageStatus(msgId);
    }
});

//Batch read updates (when someone opens a room)
socket.on('batch_read_update', ({ messages }) => {
    messages.forEach(({ msgId, delivered, read }) => {
        if (msgId && msgStatusMap[msgId]) {
            msgStatusMap[msgId].delivered = delivered;
            msgStatusMap[msgId].read = read;
            updateMessageStatus(msgId);
        }
    });
});
//RECEIVE ONLINE USERS LIST
socket.on('room_online_users', ({ roomId, users }) => {
    roomOnlineUsers[roomId] = users.map(u => u.toLowerCase());
    console.log(`[PRESENCE] ${roomId} online:`, roomOnlineUsers[roomId]);
    updatePresenceIndicators(roomId);
    updateRoomHeader(roomId);
});

//RECEIVE REAL-TIME STATUS UPDATES
socket.on('user_status', ({ username, status, roomId }) => {
    console.log(`[PRESENCE] ${username} ${status} in ${roomId}`);
    const lower = username.toLowerCase();

    if (!roomOnlineUsers[roomId]) roomOnlineUsers[roomId] = [];

    if (status === 'online') {
        if (!roomOnlineUsers[roomId].includes(lower)) {
            roomOnlineUsers[roomId].push(lower);
        }
    } else {
        roomOnlineUsers[roomId] = roomOnlineUsers[roomId].filter(u => u !== lower);
    }

    updatePresenceIndicators(roomId);
    updateRoomHeader(roomId);
});


function updatePresenceIndicators(roomId) {
    const node = document.getElementById(`node-${roomId}`);
    if (!node) return;

    // Remove existing dot
    const oldDot = node.querySelector('.presence-dot');
    if (oldDot) oldDot.remove();

    if (roomId.startsWith('DM_')) {
        const parts = roomId.split('_').slice(1);
        const otherUser = parts.find(u => u.toLowerCase() !== me.toLowerCase());
        if (otherUser) {
            const isOnline = roomOnlineUsers[roomId]?.includes(otherUser.toLowerCase()) || false;
            const titleSpan = node.querySelector('.nav-title');
            if (titleSpan) {
                const dot = document.createElement('span');
                dot.className = `presence-dot ${isOnline ? 'online' : 'offline'}`;
                dot.title = isOnline ? 'Online' : 'Offline';
                dot.style.cssText = `
                    display: inline-block;
                    width: 10px;
                    height: 10px;
                    border-radius: 50%;
                    background: ${isOnline ? '#00ff41' : 'var(--text-muted)'};
                    margin-left: 8px;
                    flex-shrink: 0;
                    box-shadow: ${isOnline ? '0 0 8px #00ff41' : 'none'};
                    transition: all 0.3s ease;
                `;
                titleSpan.appendChild(dot);
            }
        }
    }
}
function startDM(username) {
    if (username.toLowerCase() === me.toLowerCase()) return showNotify("Self-transmission loop blocked", "SYSTEM", "error");

    const roomId = `DM_${[me.toLowerCase(), username.toLowerCase()].sort().join('_')}`;
    const roomName = username;

    socket.emit('start_dm', { target: username, roomId, roomName });
    document.getElementById('search-drop').style.display = 'none';
}
//PROFILE MATRIX
function renderUserProfile() {
    const themeColors = {
        cyan: '#00f2ff',
        soft: '#f7a1c4',
        ocean: '#4fc3f7',
        midnight: '#7c4dff'
    };

    // Build theme buttons with color swatches
    let themeButtons = '';
    const themeKeys = Object.keys(themeColors);
    themeKeys.forEach(theme => {
        const isActive = currentTheme === theme;
        themeButtons += `
            <button class="profile-theme-btn ${isActive ? 'active' : ''}" 
                    onclick="changeTheme('${theme}')" 
                    style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 6px;
                        padding: 0.5rem 0.3rem;
                        border-radius: 8px;
                        border: 2px solid ${isActive ? 'var(--neon)' : 'var(--border)'};
                        background: ${isActive ? 'var(--neon-dim)' : 'transparent'};
                        color: var(--text-primary);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        font-size: 0.65rem;
                        font-weight: ${isActive ? 'bold' : 'normal'};
                        min-height: 36px;
                        width: 100%;
                    "
                    onmouseover="this.style.borderColor='var(--neon)'"
                    onmouseout="this.style.borderColor='${isActive ? 'var(--neon)' : 'var(--border)'}'">
                <span style="
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    background: ${themeColors[theme]};
                    box-shadow: 0 0 8px ${themeColors[theme]}40;
                    flex-shrink: 0;
                "></span>
                ${theme}
            </button>
        `;
    });

    // Build bubble style previews
    const bubbleStyles = [
        { 
            key: 'rect', 
            label: 'RECT', 
            preview: `
                <div style="display:flex; align-items:center; justify-content:center; width:100%; gap:4px;">
                    <div style="background:var(--neon-dim); border:1px solid var(--neon); border-radius:4px; padding:3px 8px; font-size:0.5rem; color:var(--text-primary); max-width:50px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Hi</div>
                </div>
            `
        },
        { 
            key: 'round', 
            label: 'ROUND', 
            preview: `
                <div style="display:flex; align-items:center; justify-content:center; width:100%; gap:4px;">
                    <div style="background:var(--neon-dim); border:1px solid var(--neon); border-radius:16px; padding:3px 8px; font-size:0.5rem; color:var(--text-primary); max-width:50px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Hi</div>
                </div>
            `
        },
        { 
            key: 'bubble', 
            label: 'BUBBLE', 
            preview: `
                <div style="display:flex; align-items:center; justify-content:center; width:100%; gap:4px;">
                    <div style="background:var(--neon-dim); border:1px solid var(--neon); border-radius:18px 18px 18px 4px; padding:3px 8px; font-size:0.5rem; color:var(--text-primary); max-width:50px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; position:relative;">Hi</div>
                </div>
            `
        }
    ];

    let bubbleButtons = '';
    bubbleStyles.forEach(style => {
        const isActive = bubbleStyle === style.key;
        bubbleButtons += `
            <button class="profile-geo-btn ${isActive ? 'active' : ''}" 
                    onclick="changeBubbleStyle('${style.key}')"
                    style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 4px;
                        padding: 0.5rem 0.3rem;
                        border-radius: 12px;
                        border: 2px solid ${isActive ? 'var(--neon)' : 'var(--border)'};
                        background: ${isActive ? 'var(--neon-dim)' : 'transparent'};
                        color: var(--text-primary);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        font-size: 0.6rem;
                        font-weight: ${isActive ? 'bold' : 'normal'};
                        min-height: 52px;
                        flex: 1;
                        min-width: 50px;
                    "
                    onmouseover="this.style.borderColor='var(--neon)'"
                    onmouseout="this.style.borderColor='${isActive ? 'var(--neon)' : 'var(--border)'}'">
                ${style.preview}
                ${style.label}
            </button>
        `;
    });

    // VIP effect previews
    const vipEffects = [
        { key: 'neon', label: 'NEON', emoji: '✨', glow: '#ff00ff' },
        { key: 'fire', label: 'FIRE', emoji: '🔥', glow: '#ff8800' },
        { key: 'pulse', label: 'PULSE', emoji: '💫', glow: '#00ffff' }
    ];

    let vipButtons = '';
    vipEffects.forEach(effect => {
        const isActive = vipEffect === effect.key;
        vipButtons += `
            <button class="profile-effect-btn ${isActive ? 'active' : ''}" 
                    onclick="changeVipEffect('${effect.key}')"
                    style="
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        justify-content: center;
                        gap: 2px;
                        padding: 0.5rem 0.3rem;
                        border-radius: 12px;
                        border: 2px solid ${isActive ? 'var(--neon)' : 'var(--border)'};
                        background: ${isActive ? 'var(--neon-dim)' : 'transparent'};
                        color: var(--text-primary);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        font-size: 0.6rem;
                        font-weight: ${isActive ? 'bold' : 'normal'};
                        min-height: 52px;
                        flex: 1;
                        min-width: 50px;
                    "
                    onmouseover="this.style.borderColor='var(--neon)'"
                    onmouseout="this.style.borderColor='${isActive ? 'var(--neon)' : 'var(--border)'}'">
                <span style="font-size: 1.4rem; line-height: 1;">${effect.emoji}</span>
                <span style="font-size: 0.6rem;">${effect.label}</span>
                ${isActive ? `<span style="font-size: 0.45rem; color: var(--neon);">● ACTIVE</span>` : ''}
            </button>
        `;
    });

    // ========== FONT BUTTONS ==========
    const fontKeys = Object.keys(FONT_MAP);
    let fontButtons = '';
    fontKeys.forEach(fontKey => {
        const isActive = currentFont === fontKey;
        fontButtons += `
            <button class="profile-font-btn ${isActive ? 'active' : ''}" 
                    onclick="changeFont('${fontKey}')"
                    style="
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 0.5rem 0.3rem;
                        border-radius: 8px;
                        border: 2px solid ${isActive ? 'var(--neon)' : 'var(--border)'};
                        background: ${isActive ? 'var(--neon-dim)' : 'transparent'};
                        color: var(--text-primary);
                        cursor: pointer;
                        transition: all 0.2s ease;
                        font-size: 0.7rem;
                        font-weight: ${isActive ? 'bold' : 'normal'};
                        min-height: 36px;
                        font-family: ${FONT_MAP[fontKey]};
                    "
                    onmouseover="this.style.borderColor='var(--neon)'"
                    onmouseout="this.style.borderColor='${isActive ? 'var(--neon)' : 'var(--border)'}'">
                ${fontKey.replace('-', ' ').toUpperCase()}
            </button>
        `;
    });

    const html = `
        <div style="text-align:center; margin-bottom:2rem;">
            <div class="avatar-round" style="margin:0 auto; width:90px; height:90px; font-size:2.8rem; border-width:3px; box-shadow: 0 0 30px var(--neon-dim);">
                ${me ? escapeHTML(me[0].toUpperCase()) : '?'}
            </div>
            <h3 style="margin:1rem 0 0.3rem; color:var(--text-primary); font-size:1.3rem;">${escapeHTML(me)}</h3>
            <div style="
                display: inline-block;
                padding: 0.15rem 1rem;
                border-radius: 20px;
                font-size:0.6rem;
                font-weight:bold;
                letter-spacing:1px;
                background: ${isVipUser ? 'var(--neon-dim)' : 'var(--bg-hover)'};
                color: ${isVipUser ? 'var(--neon)' : 'var(--text-secondary)'};
                border: 1px solid ${isVipUser ? 'var(--neon)' : 'var(--border)'};
            ">
                ${isVipUser ? '★ VIP' : 'STANDARD'}
            </div>
        </div>

        <!-- THEME -->
        <div style="margin:1.8rem 0 1.5rem;">
            <label style="display:block; font-size:0.6rem; letter-spacing:2px; color:var(--text-secondary); margin-bottom:0.6rem;">THEME</label>
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;">
                ${themeButtons}
            </div>
        </div>

        <!-- FONT -->
        <div style="margin:1.5rem 0;">
            <label style="display:block; font-size:0.6rem; letter-spacing:2px; color:var(--text-secondary); margin-bottom:0.6rem;">FONT</label>
            <div style="display:grid; grid-template-columns: repeat(2, 1fr); gap:6px;">
                ${fontButtons}
            </div>
        </div>

        <!-- BUBBLE STYLE -->
        <div style="margin:1.5rem 0;">
            <label style="display:block; font-size:0.6rem; letter-spacing:2px; color:var(--text-secondary); margin-bottom:0.6rem;">BUBBLE STYLE</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                ${bubbleButtons}
            </div>
        </div>

        ${isVipUser ? `
        <div style="margin:1.5rem 0;">
            <label style="display:block; font-size:0.6rem; letter-spacing:2px; color:var(--text-secondary); margin-bottom:0.6rem;">VIP EFFECT</label>
            <div style="display:flex; gap:8px; flex-wrap:wrap; justify-content:center;">
                ${vipButtons}
            </div>
        </div>
        ` : ''}

        <button onclick="logout()" style="
            margin-top:1.5rem;
            width:100%;
            padding:0.8rem;
            background: var(--danger);
            color: #fff;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            cursor: pointer;
            transition: all 0.2s ease;
            font-size:0.8rem;
            letter-spacing:1px;
        " onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            LOG OUT
        </button>
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
    const palette = THEMES[theme] || THEMES.cyan;
    for (const [prop, value] of Object.entries(palette)) {
        document.documentElement.style.setProperty(prop, value);
    }
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

//SOCKET EVENT: login_success
socket.on('login_success', (d) => {
    me = d.username;
    isVipUser = !!d.isVip;
    localStorage.setItem('dischat_username', me);

    if (typeof syncDevicePushNotification === 'function') {
        syncDevicePushNotification();
    }
    if (document.getElementById('manual-layer')) document.getElementById('manual-layer').style.display = 'none';
    if (document.getElementById('offline-overlay')) document.getElementById('offline-overlay').style.display = 'none';
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0]?.toUpperCase() || '?';
    document.getElementById('net-search').value = '';
    document.getElementById('cluster-list').innerHTML = '';
    document.getElementById('dm-list').innerHTML = '';

    // Render nodes and inject initial baseline preview states
    if (d.groups) {
        d.groups.forEach(g => {
            if (g.lastTimestamp) {
                roomTimestamps[g.roomId] = g.lastTimestamp;
            }
            renderNode(g);
            const previewEl = document.getElementById(`preview-${g.roomId}`);
            if (previewEl && g.lastMsgSnippet) {
                previewEl.innerText = g.lastMsgSnippet;
            }
        });
    }

    applyTheme(currentTheme);
    applyFont(currentFont);

    //DEEP-LINK ROUTING 
// ==================== DEEP-LINK ROUTING (FIXED) ====================
    if (pendingDeepLinkRoom) {
    // If it's a DM, ensure the name is the other user, not our own
        if (pendingDeepLinkRoom.startsWith('DM_')) {
        const other = getDMOtherUser(pendingDeepLinkRoom);
        // Correct if: name missing, equals room ID, or equals our own username
        if (other && (!pendingDeepLinkName || 
                      pendingDeepLinkName === pendingDeepLinkRoom || 
                      pendingDeepLinkName.toLowerCase() === me.toLowerCase())) {
            pendingDeepLinkName = other;
            console.log(`[DEEP-LINK] Fixed DM name from '${pendingDeepLinkName || 'undefined'}' to '${other}'`);
        }
        }
         // Join the room
         joinRoom(pendingDeepLinkRoom, pendingDeepLinkName);
           // Clear to avoid reuse
        pendingDeepLinkRoom = null;
        pendingDeepLinkName = null;
        } else {
        // Default to Global chat
        curRoom = "";
        joinRoom('global', 'GLOBAL CHAT');
    }

    // ==================== PHASE 2: PRESENCE (already handled server‑side) ====================
    // No additional client setup needed; presence updates come via 'user_status' events.

    // ==================== PHASE 3: SETUP READ TRACKING ====================
    // Wait for the chat flow to exist, then set up observers for auto‑read
    setTimeout(() => {
        setupReadTracking();
    }, 1000);

    // Request notification permission and register push
    if ("Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
    }
    registerPushDevice();
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

    // ==================== LIVE PREVIEW SNIPPET & TIMELINE INTERCEPT ====================
    const previewEl = document.getElementById(`preview-${m.room}`);
    if (previewEl) {
        previewEl.innerText = `${m.sender}: ${m.text}`;
        if (m.room !== curRoom) previewEl.style.color = 'var(--neon)';
        else previewEl.style.color = '#666';
    }

    // Capture the timestamp metric and re-index the sidebar layout priorities
    roomTimestamps[m.room] = new Date(m.timestamp || Date.now()).getTime();
    updateSidebarSorting(m.room);
    // ===================================================================================

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
    displayName,
    m.sender   
         );
});

socket.on('chat_history', (logs) => {
    document.getElementById('msg-flow').innerHTML = "";
    lastDisplayedDate = null;
    
    logs.forEach(appendMsg);
    
    // Mark all messages in the history as delivered to the current user
    const myUsername = me.toLowerCase();
    const msgIds = logs
        .filter(msg => msg.sender.toLowerCase() !== myUsername && msg._id)
        .map(msg => msg._id);
    
    if (msgIds.length > 0) {
        // Send batch delivered
        socket.emit('room_messages_read', {
            roomId: curRoom,
            messageIds: msgIds
        });
    }
});

socket.on('auth_status', (d) => {
    // For login status, show in login panel
    const loginMsg = document.getElementById('auth-msg');
    const regMsg = document.getElementById('reg-msg');
    
    if (d.ok && d.m.includes('AWAITING_APPROVAL')) {
        // Registration success
        if (regMsg) {
            regMsg.innerText = '✅ ' + d.m;
            regMsg.style.color = 'var(--neon)';
        }
        // After a short delay, switch to login panel with a message
        setTimeout(() => {
            switchAuthPanel('login');
            const loginMsg = document.getElementById('auth-msg');
            if (loginMsg) {
                loginMsg.innerText = '📩 Your account is pending authorization. You will be able to log in once approved.';
                loginMsg.style.color = 'var(--text-secondary)';
            }
        }, 2000);
    } else if (d.ok) {
        // Login success – handled by login_success, ignore here
    } else {
        // Error messages
        const targetMsg = document.getElementById('auth-msg');
        if (targetMsg) {
            targetMsg.innerText = '❌ ' + d.m;
            targetMsg.style.color = 'var(--danger)';
        }
        // Also show in register panel if that's active
        const regMsgEl = document.getElementById('reg-msg');
        if (regMsgEl && document.getElementById('register-panel').style.display !== 'none') {
            regMsgEl.innerText = '❌ ' + d.m;
            regMsgEl.style.color = 'var(--danger)';
        }
    }
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

//DEEP-LINK PARSER
function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const roomId = params.get('join');
    const roomName = params.get('name');

    if (roomId) {
        pendingDeepLinkRoom = roomId;
        pendingDeepLinkName = roomName || roomId;

        // Remove query params from URL to prevent re-trigger on reload
        window.history.replaceState({}, document.title, window.location.pathname);
        console.log(`[DEEP-LINK] Pending room: ${pendingDeepLinkRoom} (${pendingDeepLinkName})`);
    }
}

// Call it immediately
handleDeepLink();


window.onload = () => {
    // Note: tryAutoLogin is now safely hooked up to the socket 'connect' event handler
    setTimeout(() => document.getElementById('m-in')?.focus(), 800);
    
    document.addEventListener('click', (e) => {
        if (!e.target.closest('#net-search') && !e.target.closest('#search-drop')) {
            document.getElementById('search-drop').style.display = 'none';
        }
    });
    document.addEventListener('touchstart', (e) => {
        // If the user taps anywhere outside an active reaction menu, close all menus
        if (!e.target.closest('.reaction-trigger-zone') && !e.target.closest('.bubble-content')) {
            document.querySelectorAll('.reaction-trigger-zone').forEach(zone => {
                zone.style.display = 'none';
            });
        }
    }, { passive: true });

    closeSidebarOnChatClick();
};

//CLUSTER NODE PROVISIONING
function promptClusterInvite() {
    if (!curRoom || !curRoom.startsWith('CLUSTER_')) return;
    
    const html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1rem;">SPLICE NODE INTO STREAM</h2>
        <p style="font-size:0.85rem; opacity:0.7; margin-bottom:1.5rem; text-align:center;">Input the exact identity signature identifier to connect them directly to this operational cluster pipeline.</p>
        <input id="invite-target-uid" class="gate-input" placeholder="IDENTITY_ID" autocomplete="off" spellcheck="false">
        <button class="gate-btn" onclick="submitClusterInvite()" style="margin-top:10px;">AUTHORIZE SYNC</button>
        <button class="gate-btn outline" onclick="closeModal()" style="margin-top:8px;">ABORT</button>
    `;
    showModal(html);
    setTimeout(() => document.getElementById('invite-target-uid')?.focus(), 150);
}

function submitClusterInvite() {
    const targetUsername = document.getElementById('invite-target-uid').value.trim();
    if (!targetUsername) return showNotify("Target Identity ID required", "SYSTEM", "error");

    socket.emit('invite_to_cluster', {
        roomId: curRoom,
        targetUsername: targetUsername
    });
    closeModal();
}
//METRIC ORDERING ALGORITHM 
function updateSidebarSorting(roomId) {
    const node = document.getElementById(`node-${roomId}`);
    if (!node) return;

    const timestamp = roomTimestamps[roomId] || 0;
    
    let calculatedOrder;
    if (timestamp === 0) {
        calculatedOrder = 999999999; 
    } else {
        calculatedOrder = -Math.floor(timestamp / 1000); 
    }
    
    node.style.order = calculatedOrder;
}

///EMOJI
function openEmojiPickerModal(targetMsgId = null) {
    const categories = [
        {
            name: "SMILEYS",
            glyphs: ["😀","😃","😄","😁","😆","😅","😂","🤣","😊","😇","🙂","🙃","😉","😌","😍","🥰","😘","😗","😙","😚","😋","😛","😝","😜","🤪","🤨","🧐","🤓","😎","🤩","🥳","😏","😒","😞","😔","😟","😕","🙁","☹️","😣","😖","😫","😩","🥺","😢","😭","😤","😠","😡","🤬","🤯","😳","🥵","🥶","😱","😨","😰","😥","😓","🤗","🤔","🤭","🤫","🤥","😶","😐","😑","😬","🙄","😯","😦","😧","😮","😲","🥱","😴","🤤","😪","😵","🤐","🥴","🤢","🤮","🤧","😷","🤒","🤕","🤠","😈","👿","👹","👺","🤡","💩","👻","💀","☠️","👽","👾","🤖","🎃"]
        },
        {
            name: "HAND SIGNS",
            glyphs: ["👍","👎","✊","👊","🤛","🤜","🤞","✌️","🤟","🤘","👌","🤌","🤏","👈","👉","👆","👇","☝️","✋","🤚","🖐️","🖖","👋","🤙","💪","🦾","🖕","✍️","🙏","🤝","👏","🙌","👐","🤲"]
        },
        {
            name: "HEART",
            glyphs: ["❤️","🧡","💛","💚","💙","💜","🖤","🤍","🤎","💔","❣️","💕","💞","💓","💗","💖","💘","💝","💟", "🔥", "👑", "💯", "🚀", "⭐", "🎉", "🎊", "🎈", "🎂", "🎄", "🎆", "🎇", "🧨", "✨", "⚽", "🏀", "🏈", "🎮", "🕹️", "🎰"]
        }
    ];
    
    let html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:1rem;">SELECT TRANSMISSION GLYPH</h2>
        <div class="glyph-matrix-viewport">
    `;
    
    categories.forEach(cat => {
        html += `
            <div class="glyph-category-segment">
                <div class="emoji-category-title">_${cat.name}</div>
                <div class="emoji-category-grid">
        `;
        
        cat.glyphs.forEach(emoji => {
            //Pass targetMsgId dynamically into the click handler string
            html += `<span onclick="insertEmoji('${emoji}', ${targetMsgId ? `'${targetMsgId}'` : 'null'})" class="react-btn">${emoji}</span>`;
        });
        
        html += `
                </div>
            </div>
        `;
    });
    
    html += `</div><button class="gate-btn outline" onclick="closeModal()" style="margin-top:15px;">DISMISS</button>`;
    showModal(html);
}

// UNIFIED GLYPH ROUTER ENGINE
function insertEmoji(emoji, targetMsgId = null) {
    if (targetMsgId && targetMsgId !== 'null') {
        // ROUTE A: A target message signature exists. Dispatch straight to backend reaction logs!
        submitReaction(targetMsgId, emoji);
    } else {
        // ROUTE B: Fallback to active terminal message buffer typing
        const input = document.getElementById('m-in');
        if (input) {
            input.value += emoji;
            input.focus();
        }
    }
    closeModal();
}


//REAL-TIME REACTION DISPATCHERS 
function submitReaction(msgId, emoji) {
    socket.emit('message_reaction', { msgId, emoji });
    
    // Forcibly hide the hovering zone instantly after clicking an emoji
    const triggerZone = document.querySelector(`#msg-${msgId} .reaction-trigger-zone`);
    if (triggerZone) {
        // Temporarily override the display to hide it until the user moves their mouse away/taps off
        triggerZone.style.display = 'none';
        setTimeout(() => triggerZone.style.removeProperty('display'), 300);
    }
}

function renderReactionBadges(msgId, reactionsArray) {
    const tray = document.getElementById(`react-tray-${msgId}`);
    if (!tray) return;
    tray.innerHTML = "";

    if (!reactionsArray || reactionsArray.length === 0) return;

    // Group the array configurations by matching emoji keys
    const counts = {};
    reactionsArray.forEach(r => {
        counts[r.emoji] = counts[r.emoji] || { count: 0, users: [] };
        counts[r.emoji].count++;
        counts[r.emoji].users.push(r.username.toLowerCase());
    });

    // Generate responsive pill layout DOM bindings
    for (const [emoji, meta] of Object.entries(counts)) {
        const badge = document.createElement('span');
        const iReacted = meta.users.includes(me.toLowerCase());
        
        badge.className = `reaction-badge ${iReacted ? 'active' : ''}`;
        badge.innerHTML = `${emoji} <span style="font-weight:bold;">${meta.count}</span>`;
        
        //Tapping a reaction badge opens the detailed breakdown list panel!
        badge.onclick = (e) => {
            e.stopPropagation();
            viewReactionDetails(emoji, meta.users);
        };
        
        tray.appendChild(badge);
    }
}
//REACTION DRILLDOWN REGISTRY ======================
function viewReactionDetails(emoji, usersArray) {
    let html = `
        <h2 style="color:var(--neon); text-align:center; margin-bottom:0.5rem;">REACTION DETAILS</h2>
        <div style="text-align:center; font-size:2.5rem; margin-bottom:1.5rem;">${emoji}</div>
        <div style="color:var(--neon); font-size:0.75rem; letter-spacing:2px; margin-bottom:8px; opacity:0.7; border-bottom:1px solid var(--border); padding-bottom:4px;">
            _IDENTIFIED_OPERATIVES (${usersArray.length})
        </div>
        <div style="max-height:35vh; overflow-y:auto; padding-right:5px; margin-bottom:1.5rem;">
    `;

    usersArray.forEach(user => {
        const isItMe = user.toLowerCase() === me.toLowerCase();
        html += `
            <div style="display:flex; align-items:center; justify-content:between; padding:10px; border-bottom:1px solid var(--border-light); font-family:'JetBrains Mono', monospace;">
            <span style="color:var(--text-primary); font-weight:bold;">${escapeHTML(user)}</span>                ${isItMe ? '<span style="color:var(--neon); font-size:0.8rem; margin-left:auto;">(YOU)</span>' : ''}
            </div>
        `;
    });

    html += `
        </div>
        <button class="gate-btn outline" onclick="closeModal()" style="width:100%;">DISMISS</button>
    `;
    showModal(html);
}
// Global live channel broadcast listener loop binding intercepts
socket.on('reaction_updated', ({ msgId, reactions }) => {
    renderReactionBadges(msgId, reactions);
});
function initiateReplySequence(msgId, sender, rawText) {
    currentReplyTarget = { msgId, sender, text: rawText };
    
    // Check if the reply visual indicator bar is already rendered in the DOM
    let bar = document.getElementById('reply-context-anchor-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'reply-context-anchor-bar';
        
        // Inject the layout bar directly above the main chat input bay area container
        const inputBay = document.querySelector('.input-bay');
        inputBay.parentNode.insertBefore(bar, inputBay);
    }

    bar.innerHTML = `
        <div class="reply-bar-accent-line"></div>
        <div class="reply-bar-payload-content">
            <small style="color:var(--neon); font-weight:bold;">REPLY_TO: @${escapeHTML(sender)}</small>
            <div class="reply-bar-text-preview-snippet">${escapeHTML(rawText)}</div>
        </div>
        <button class="close-reply-context-sequence-btn" onclick="clearActiveReplySequence()">&times;</button>
    `;
    
    // Smoothly adjust sizing properties
    bar.style.display = 'flex';
    document.getElementById('m-in')?.focus();
}

function clearActiveReplySequence() {
    currentReplyTarget = null;
    const bar = document.getElementById('reply-context-anchor-bar');
    if (bar) bar.style.display = 'none';
}

function scrollToTargetMessage(msgId) {
    const el = document.getElementById(`msg-${msgId}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Flash animation to highlight the linked parent element
        el.style.animation = 'none';
        setTimeout(() => el.style.animation = 'reply-target-flash-highlight 1.5s ease', 10);
    } else {
        showNotify("Target baseline transmission archived or inaccessible", "SYSTEM", "info");
    }
}

// ====================== EXTENDED USER-TO-USER GAME REGISTRY CONTROLLERS ======================
function submitGameMove(matchId, index) {
    socket.emit('make_move', { matchId, index });
}

let activeGameTimers = {};

socket.on('match_updated', (match) => {
    const statusBanner = document.getElementById(`ttt-status-${match._id}`);
    if (!statusBanner) return;

    if (activeGameTimers[match._id]) {
        clearInterval(activeGameTimers[match._id]);
        delete activeGameTimers[match._id];
    }

    match.board.forEach((sign, idx) => {
        const cell = document.getElementById(`cell-${match._id}-${idx}`);
        if (cell) {
            cell.innerText = sign;
            if (sign !== "") {
                cell.disabled = true;
                cell.classList.add('occupied', sign.toLowerCase());
            }
        }
    });

    const cleanMe = me.toLowerCase();
    const pX = match.playerX.toLowerCase();
    const pO = match.playerO.toLowerCase();

    if (match.status === "ACTIVE" && pO === "enclave_challenger") {
        let timeLeft = 15;
        statusBanner.innerText = `WAITING FOR ACCEPTANCE... (${timeLeft}s)`;
        statusBanner.style.color = "#ffcc00";

        activeGameTimers[match._id] = setInterval(() => {
            timeLeft--;
            const currentBanner = document.getElementById(`ttt-status-${match._id}`);
            if (currentBanner) {
                currentBanner.innerText = `WAITING FOR ACCEPTANCE... (${timeLeft}s)`;
                if (timeLeft <= 0) {
                    clearInterval(activeGameTimers[match._id]);
                    currentBanner.innerText = "DUEL TERMINATED: TARGET OFFLINE/TIMEOUT";
                    currentBanner.style.color = "var(--danger)";
                    disableAllMatchCells(match._id);
                    socket.emit('match_timeout_close', { matchId: match._id });
                }
            }
        }, 1000);
        return;
    }

    if (match.status === "ACTIVE") {
        if (cleanMe !== pX && cleanMe !== pO) {
            disableAllMatchCells(match._id);
            statusBanner.innerText = `WATCHING: @${pX.toUpperCase()} VS @${pO.toUpperCase()}`;
            statusBanner.style.color = "var(--text-secondary)";
            return;
        }
    }

    if (match.status === "ACTIVE") {
        const activeUser = match.turn === "X" ? match.playerX : match.playerO;
        statusBanner.innerText = `TURN: @${activeUser.toUpperCase()} (${match.turn})`;
        statusBanner.style.color = "var(--neon)";
    } else if (match.status === "DRAW") {
        statusBanner.innerText = `STATUS: ENGAGEMENT DRAW`;
        statusBanner.style.color = "var(--text-secondary)";
        disableAllMatchCells(match._id);
    } else if (match.status === "WON") {
        if (cleanMe === pX || cleanMe === pO) {
            const isWinnerMe = match.winner.toLowerCase() === cleanMe;
            statusBanner.innerText = isWinnerMe ? `STATUS: TRANSMISSION VICTORY SECURED` : `STATUS: CRITICAL MATCH DEFEAT`;
            statusBanner.style.color = isWinnerMe ? "#00ff41" : "var(--danger)";
        } else {
            statusBanner.innerText = `MATCH OVER: @${match.winner.toUpperCase()} WINS!`;
            statusBanner.style.color = "#ffcc00";
        }
        disableAllMatchCells(match._id);
    } else if (match.status === "TIMEOUT") {
        statusBanner.innerText = "DUEL TERMINATED: CONNECTION TIMEOUT";
        statusBanner.style.color = "var(--danger)";
        disableAllMatchCells(match._id);
    }
});

function disableAllMatchCells(matchId) {
    for (let i = 0; i < 9; i++) {
        const cell = document.getElementById(`cell-${matchId}-${i}`);
        if (cell) cell.disabled = true;
    }
}
// ====================== DYNAMIC TIC TAC TOE CONFIGURATION INTERFACES ======================
let _tttSign = "X";
let _tttScope = "OPEN";

function openTTTConfigModal() {
    const isDM = curRoom.startsWith('DM_');
    let targetDirectUser = "";
    
    if (isDM) {
        targetDirectUser = getDMOtherUser(curRoom) || "";
    }

    let html = `
        <h2 style="color:#ffcc00; text-align:center; margin-bottom:1rem;">DUEL_CONFIGURATION_PROMPT</h2>
        <p style="font-size:0.8rem; opacity:0.7; text-align:center; margin-bottom:1.5rem;">Calibrate tactical metrics before initializing match stream payload indicators.</p>
        
        <label style="color:var(--neon); font-size:0.8rem; display:block; margin-bottom:6px;">_ALLOCATE_SIGNATURE_MATRIX</label>
        <div style="display:flex; gap:10px; margin-bottom:1.5rem;">
            <button id="ttt-choose-X" class="gate-btn outline active" onclick="setTTTSignChoice('X')" style="flex:1; border-color:#00f2ff; color:#ff0d00; margin:0;">CHOOSE_X</button>
            <button id="ttt-choose-O" class="gate-btn outline" onclick="setTTTSignChoice('O')" style="flex:1; border-color:#ff0055; color:#ff0055; margin:0;">CHOOSE_O</button>
        </div>
        <input type="hidden" id="ttt-selected-sign" value="X">
    `;

    if (!isDM) {
        // GROUP CHAT SCOPE FILTERS
        html += `
            <label style="color:var(--neon); font-size:0.8rem; display:block; margin-bottom:6px;">_DEPLOYMENT_TARGET_SCOPE</label>
            <div style="display:flex; gap:10px; margin-bottom:1.2rem;">
                <button id="scope-open" class="gate-btn outline active" onclick="setTTTScope('OPEN')" style="flex:1; margin:0; font-size:0.85rem;">ANYONE_IN_GROUP</button>
                <button id="scope-target" class="gate-btn outline" onclick="setTTTScope('TARGET')" style="flex:1; margin:0; font-size:0.85rem;">TARGET_SPECIFIC</button>
            </div>
            
            <div id="ttt-target-filter-bay" style="display:none; margin-bottom:1.2rem; position:relative;">
                <input id="ttt-duel-search" class="gate-input" placeholder="Search target user..." oninput="handleDuelSearch()" style="margin:0;">
                <div id="ttt-duel-search-drop" class="search-results" style="width:100%; left:0; display:none; max-height:180px;"></div>
                <input type="hidden" id="ttt-final-target-user" value="">
            </div>
        `;
    } else {
        html += `<input type="hidden" id="ttt-final-target-user" value="${targetDirectUser}">`;
    }

    html += `
        <button class="gate-btn" onclick="executeMatchDeployment()" style="background:#ffcc00; color:var(--bg-input); margin-top:10px; font-weight:bold;">START DUEL</button>
        <button class="gate-btn outline" onclick="closeModal()" style="margin-top:6px;">CANCEL</button>
    `;
    
    showModal(html);
}

function setTTTSignChoice(sign) {
    _tttSign = sign;
    
    const hiddenSignInput = document.getElementById('ttt-selected-sign');
    if (hiddenSignInput) hiddenSignInput.value = sign;

    const btnX = document.getElementById('ttt-choose-X');
    const btnO = document.getElementById('ttt-choose-O');
    if(btnX && btnO) {
        btnX.classList.toggle('active', sign === 'X');
        btnO.classList.toggle('active', sign === 'O');
    }
}

function setTTTScope(scope) {
    _tttScope = scope;
    const sOpen = document.getElementById('scope-open');
    const sTarget = document.getElementById('scope-target');
    const filterBay = document.getElementById('ttt-target-filter-bay');
    
    if(sOpen && sTarget) {
        sOpen.classList.toggle('active', scope === 'OPEN');
        sTarget.classList.toggle('active', scope === 'TARGET');
    }
    if (filterBay) filterBay.style.display = scope === 'TARGET' ? 'block' : 'none';
}

function handleDuelSearch() {
    const q = document.getElementById('ttt-duel-search').value.trim();
    const drop = document.getElementById('ttt-duel-search-drop');
    if (q.length < 2) { 
        if (drop) drop.style.display = 'none'; 
        return; 
    }
    
    // FIX: Swapped socket.emit('global_search') out for group-isolated member search pipelines
    socket.emit('cluster_member_search', { roomId: curRoom, query: q });
}

function executeMatchDeployment() {
    const targetUser = document.getElementById('ttt-final-target-user')?.value || "";
    const isDM = curRoom.startsWith('DM_');
    
    if (!isDM && _tttScope === 'TARGET' && !targetUser) {
        return showNotify("Target node username identity selection required", "ERROR", "error");
    }

    socket.emit('create_match', {
        roomId: curRoom,
        chosenSign: _tttSign,
        targetUser: isDM || _tttScope === 'TARGET' ? targetUser : "enclave_challenger"
    });
    closeModal();
}
// ====================== FIX: SECURE ISOLATED GROUP DUEL DROPDOWN ======================
socket.on('ttt_duel_search_results', ({ users }) => {
    const duelDrop = document.getElementById('ttt-duel-search-drop');
    if (!duelDrop) return; // Ignore if the user closed the configuration modal mid-search

    duelDrop.innerHTML = '';
    duelDrop.style.display = 'block';

    if (!users || users.length === 0) {
        duelDrop.innerHTML = `<div style="padding:10px; color:#666; font-size:0.8rem; text-align:center;">No matching members found</div>`;
        return;
    }

    users.forEach(u => {
        if (u.username.toLowerCase() === me.toLowerCase()) return; 

        const div = document.createElement('div');
        div.className = 'nav-item';
        div.style.padding = '8px 12px';
        div.style.fontSize = '0.85rem';
        div.style.cursor = 'pointer';
        div.textContent = u.username;

        div.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();

            const searchInput = document.getElementById('ttt-duel-search');
            const hiddenTarget = document.getElementById('ttt-final-target-user');

            if (searchInput) searchInput.value = u.username.toUpperCase();
            if (hiddenTarget) {
                hiddenTarget.value = u.username.toLowerCase();
                console.log(`[TTT_SYSTEM] Group target locked: ${hiddenTarget.value}`);
            }

            duelDrop.style.display = 'none';
        };
        duelDrop.appendChild(div);
    });
});


//   PROGRESSIVE WEB APP CORRIDOR & NOTIFICATION PUMP


// Helper conversion utility required for Web Push VAPID keys
function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

// 1. Register the worker silently on load
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(() => console.log('>>> [PWA_SYSTEM]: Core Pipeline Linked'))
            .catch(error => console.error('❌ [PWA_SYSTEM]: Pipeline Error: ', error));
    });
}

// 2. Standalone function to sync token WITH username
async function registerPushDevice() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const registration = await navigator.serviceWorker.ready;
        const EXPOSED_PUBLIC_VAPID_KEY = 'BMjJgE_cppUwWegzl6U6yHIeo_J_0Q8oufr6CII5B8RoZjYwpD4WN_HykdtW7FWBIn0VEUIDFZls-_ZjFe2pN28';
        
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(EXPOSED_PUBLIC_VAPID_KEY)
        });

        // Send BOTH subscription and username to the backend
        await fetch('/api/register-push-device', {
            method: 'POST',
            body: JSON.stringify({ subscription: subscription, username: me }),
            headers: { 'Content-Type': 'application/json' }
        });
        console.log('🚀 [PWA_SYSTEM]: Device linked to background notifications.');
    } catch (err) {
        console.error('❌ [PWA_SYSTEM]: Failed to sync push configuration: ', err);
    }
}
