const socket = io();
let me = "";
let curRoom = "";
let curRoomName = "";
let isVipUser = false;
let currentTheme = localStorage.getItem('dischat-theme') || 'cyan';
let bubbleStyle = localStorage.getItem('dischat-bubble') || 'rect';
let vipEffect = localStorage.getItem('dischat-vipeffect') || 'neon';
let roomTimestamps = {};
let currentReplyTarget = null;
//NOTIFICATION & AUDIO SETUP
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

//MANUAL & ONBOARDING FLOW
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

//AUTH
function auth(type) {
    const u = document.getElementById('l-u').value.trim();
    const p = document.getElementById('l-p').value.trim();
    if (!u || !p) return showNotify("Username AND PASSKEY REQUIRED", "ERROR", "error");
    
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

    // Removed the [DM] and [C] bracket prefixes for a pristine layout
    div.innerHTML = `
        <span class="nav-title" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: bold;">
            ${displayName}
        </span>
        <div id="preview-${g.roomId}" class="nav-preview">No transmissions yet</div>
    `;

    div.onclick = () => joinRoom(g.roomId, displayName);
    list.appendChild(div);
    
    updateSidebarSorting(g.roomId);
}

function joinRoom(id, name) {
    if (curRoom === id) return;

    curRoom = id;
    curRoomName = name || id;

    document.getElementById('active-room').innerText = curRoomName;
    document.getElementById('msg-flow').innerHTML = "";

    // Clear unread snippet highlight states upon reading
    const targetPreview = document.getElementById(`preview-${id}`);
    if (targetPreview) targetPreview.style.color = '#666';

    // UPDATED: RENDER DUEL ACTIONS IN BOTH CLUSTERS AND DIRECT PEERS
    const actionContainer = document.getElementById('header-actions');
    if (actionContainer) {
        if (id.startsWith('CLUSTER_')) {
            // Displays both the cluster invite button and new game launcher button side-by-side
            actionContainer.innerHTML = `
                <button class="gate-btn outline" onclick="promptClusterInvite()" style="margin: 0 8px 0 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; display: inline-block;">
                    [+ ADD PEOPLE]
                </button>
                <button class="gate-btn outline" onclick="openTTTConfigModal()" style="margin: 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; border-color: #ffcc00; color: #ffcc00; display: inline-block;">
                    [⚔️DUEL]
                </button>
            `;
            actionContainer.style.display = 'block';
        } else if (id.startsWith('DM_')) {
            // Displays just the game launcher button inside individual direct peer chats
            actionContainer.innerHTML = `
                <button class="gate-btn outline" onclick="openTTTConfigModal()" style="margin: 0; padding: 0.4rem 1rem; font-size: 0.85rem; width: auto; height: auto; border-color: #ffcc00; color: #ffcc00;">
                    [⚔️DUEL]
                </button>
            `;
            actionContainer.style.display = 'block';
        } else {
            // Hides actions entirely if navigating back into the main _GLOBAL room frequency
            actionContainer.style.display = 'none';
        }
    }

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

// message logic with reply
function appendMsg(m) {
    const wrap = document.getElementById('msg-flow');
    
    // ==================== FIX: STREAM TIMELINE HYDRATION DECODER INTERCEPT ====================
    if (m.type === "TICTACTOE") {
        const gameDiv = document.createElement('div');
        gameDiv.className = "centered-game-matrix-node";
        gameDiv.id = `game-node-${m.matchId}`;
        
        // Parse the persistent payload variables from backend logs if they exist
        let savedState = null;
        if (m.text && m.text.startsWith('{')) {
            try { savedState = JSON.parse(m.text); } catch(e) { savedState = null; }
        }

        // Generate matrix layout components
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

        // If history contains records, run an instant UI hydration pass
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
                        banner.style.color = "#8b949e";
                    } else {
                        const activeUser = savedState.turn === "X" ? savedState.playerX : savedState.playerO;
                        banner.innerText = `TURN: @${activeUser.toUpperCase()} (${savedState.turn})`;
                        banner.style.color = "var(--neon)";
                    }
                } else if (savedState.status === "DRAW") {
                    banner.innerText = `STATUS: ENGAGEMENT DRAW`;
                    banner.style.color = "#8b949e";
                    disableAllMatchCells(m.matchId);
                } else if (savedState.status === "WON") {
                    if (cleanMe === pX || cleanMe === pO) {
                        const isWinnerMe = savedState.winner.toLowerCase() === cleanMe;
                        banner.innerText = isWinnerMe ? `STATUS: YOU WON` : `STATUS: YOU LOST `;
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
    
    const isMe = m.sender.toLowerCase() === me.toLowerCase();
    
    // Check if the message is a system notification notice
    if (m.sender === "SYSTEM") {
        const sysDiv = document.createElement('div');
        sysDiv.className = "system-broadcast-badge";
        sysDiv.innerHTML = `<span>${escapeHTML(m.text)}</span>`;
        wrap.appendChild(sysDiv);
        wrap.scrollTop = wrap.scrollHeight;
        return;
    }

    const vipClass = m.isVip ? `vip-message vip-${vipEffect}` : '';
    const div = document.createElement('div');
    div.className = `msg-bubble ${isMe ? 'me' : ''} ${bubbleStyle} ${vipClass}`;
    div.id = `msg-${m._id}`;

    const vipTag = m.isVip ? ' ★VIP' : '';
    const safeSender = escapeHTML(m.sender);
    const safeText = escapeHTML(m.text);

    // Build context-aware reference blocks if this packet is linked to a previous message reply
    let replyQuoteHTML = '';
    if (m.replyTo) {
        replyQuoteHTML = `
            <div class="nested-reply-quote" onclick="scrollToTargetMessage('${m.replyTo.msgId}')">
                <small style="color:var(--neon); font-weight:bold;">@${escapeHTML(m.replyTo.sender)}</small>
                <div class="reply-quote-text-snippet">${escapeHTML(m.replyTo.text)}</div>
            </div>
        `;
    }

    // 1. GENERATE THE STRUCTURAL DOM TEMPLATE (Added explicit Desktop Reply control node)
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
                ${replyQuoteHTML}
                <small style="color:var(--neon)">[${safeSender}]${vipTag}</small><br>
                <span class="msg-text-payload">${safeText}</span>
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

    // ==================== INTERACTION: MOBILE SWIPE-TO-REPLY ENGINE ====================
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

            // Only recognize horizontal swipes sliding rightward (WhatsApp style movement)
            if (diffX > 10 && !isLongPress) {
                isSwiping = true;
                clearTimeout(touchTimer); // Intentionally kill long-press loops if movement starts
                
                // Limit swipe distance
                const translateAmt = Math.min(diffX, 70); 
                bubbleContent.style.transform = `translateX(${translateAmt}px)`;
                
                // Gradually reveal the reply icon as the swipe distance increases
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
                // If the user swiped far enough past our 55px threshold, execute the reply action
                if (diffX > 55) {
                    initiateReplySequence(m._id, m.sender, m.text);
                    if (navigator.vibrate) navigator.vibrate([15, 10, 15]);
                }
                
                // Snap the message layout back into place with a smooth transition animation
                bubbleContent.style.transition = "transform 0.25s ease";
                bubbleContent.style.transform = "translateX(0px)";
                
                const indicator = swipeContainer.querySelector('.swipe-reply-indicator-icon');
                if (indicator) {
                    indicator.style.transition = "opacity 0.2s, transform 0.2s";
                    indicator.style.opacity = "0";
                    indicator.style.transform = "translateY(-50%) scale(0.4)";
                }

                // Clean up transition rules once the reset animation finishes
                setTimeout(() => {
                    bubbleContent.style.removeProperty('transition');
                    if (indicator) indicator.style.removeProperty('transition');
                }, 260);
            }
        }, { passive: true });

        // Safety listeners to ensure smooth click tracking
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

// ====================== UNIFIED SEARCH INTENT ROUTER ENGINE ======================
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

function startDM(username) {
    if (username.toLowerCase() === me.toLowerCase()) return showNotify("Self-transmission loop blocked", "SYSTEM", "error");

    const roomId = `DM_${[me.toLowerCase(), username.toLowerCase()].sort().join('_')}`;
    const roomName = username;

    socket.emit('start_dm', { target: username, roomId, roomName });
    document.getElementById('search-drop').style.display = 'none';
}
//PROFILE MATRIX
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

//SOCKET EVENT FLOWS
socket.on('login_success', (d) => {
    me = d.username;
    isVipUser = !!d.isVip;
    localStorage.setItem('dischat_username', me);

    if (document.getElementById('manual-layer')) document.getElementById('manual-layer').style.display = 'none';
    if (document.getElementById('offline-overlay')) document.getElementById('offline-overlay').style.display = 'none';
    document.getElementById('auth-layer').style.display = 'none';
    document.getElementById('app').style.display = 'grid';
    document.getElementById('nav-avatar').innerText = me[0]?.toUpperCase() || '?';

    document.getElementById('cluster-list').innerHTML = '';
    document.getElementById('dm-list').innerHTML = '';

    // Render nodes and inject initial baseline preview states
    if (d.groups) {
        d.groups.forEach(g => {
            // Seed the localized cache dictionary
            if (g.lastTimestamp) {
                roomTimestamps[g.roomId] = g.lastTimestamp;
            }
            
            renderNode(g);
            
            // Hydrate initial preview element markup snippets
            const previewEl = document.getElementById(`preview-${g.roomId}`);
            if (previewEl && g.lastMsgSnippet) {
                previewEl.innerText = g.lastMsgSnippet;
            }
        });
    }

    applyTheme(currentTheme);

    const activeRoomId = curRoom || 'global';
    const activeRoomName = curRoomName || 'GLOBAL CHAT';
    curRoom = ""; 
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
            <div style="display:flex; align-items:center; justify-content:between; padding:10px; border-bottom:1px solid rgba(255,255,255,0.03); font-family:'JetBrains Mono', monospace;">
                <span style="color:#fff; font-weight:bold;">${escapeHTML(user)}</span>
                ${isItMe ? '<span style="color:var(--neon); font-size:0.8rem; margin-left:auto;">(YOU)</span>' : ''}
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
            statusBanner.style.color = "#8b949e";
            return;
        }
    }

    if (match.status === "ACTIVE") {
        const activeUser = match.turn === "X" ? match.playerX : match.playerO;
        statusBanner.innerText = `TURN: @${activeUser.toUpperCase()} (${match.turn})`;
        statusBanner.style.color = "var(--neon)";
    } else if (match.status === "DRAW") {
        statusBanner.innerText = `STATUS: ENGAGEMENT DRAW`;
        statusBanner.style.color = "#8b949e";
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
        <button class="gate-btn" onclick="executeMatchDeployment()" style="background:#ffcc00; color:#000; margin-top:10px; font-weight:bold;">START DUEL</button>
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

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(async (registration) => {
                console.log('>>> [PWA_SYSTEM]: Core Pipeline Linked');

                // Wait until the service worker is fully active
                await navigator.serviceWorker.ready;

                // Request user's permission to send push notifications
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.warn('⚠️ [PWA_SYSTEM]: Notification permissions denied.');
                    return;
                }

                // CRITICAL: Replace this string with your actual PUBLIC VAPID key
                const EXPOSED_PUBLIC_VAPID_KEY = 'BMjJgE_cppUwWegzl6U6yHIeo_J_0Q8oufr6CII5B8RoZjYwpD4WN_HykdtW7FWBIn0VEUIDFZls-_ZjFe2pN28';

                try {
                    // Subscribe this browser device to Google/Apple push servers
                    const subscription = await registration.pushManager.subscribe({
                        userVisibleOnly: true,
                        applicationServerKey: urlBase64ToUint8Array(EXPOSED_PUBLIC_VAPID_KEY)
                    });

                    // Send the device subscription object to your backend endpoint
                    await fetch('/api/register-push-device', {
                        method: 'POST',
                        body: JSON.stringify(subscription),
                        headers: { 'Content-Type': 'application/json' }
                    });
                    console.log('🚀 [PWA_SYSTEM]: Device registered for background notifications.');
                } catch (err) {
                    console.error('❌ [PWA_SYSTEM]: Failed to sync push configuration: ', err);
                }
            })
            .catch(error => console.error('❌ [PWA_SYSTEM]: Core Pipeline Error: ', error));
    });
}