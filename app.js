// ===== STATE =====
let socket = null;
let myRoomId = null;
let myNickname = null;
let myIsAdmin = false;
let typingTimer = null;
let isTyping = false;
let kickTargetNickname = null;
let messageGroups = {};
let lastSenderNick = null;

const EMOJIS = ['😊', '😂', '🔥', '❤️', '👍', '😎', '🎉', '😅', '🤔', '💯', '🚀', '✨', '😍', '👀', '💪', '🙌', '😭', '😴', '😡', '🤣', '🌟', '💡', '🎯', '⚡', '🌈', '🍕', '🎮', '🎵', '🤝', '👋'];

// ===== SCREEN MANAGEMENT =====
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.style.display = 'none';
  });
  const screen = document.getElementById(id);
  screen.style.display = 'flex';
  requestAnimationFrame(() => screen.classList.add('active'));
}

// ===== UTILITIES =====
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
}
function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}
function setLoading(btn, loading) {
  btn.querySelector('.btn-text').style.opacity = loading ? '0' : '1';
  const loader = btn.querySelector('.btn-loader');
  if (loading) loader.classList.remove('hidden');
  else loader.classList.add('hidden');
  btn.disabled = loading;
}
function showToast(msg, duration = 3000) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), duration);
}
function avatarInitial(nickname) {
  return nickname ? nickname[0].toUpperCase() : '?';
}
function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function togglePass(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') { input.type = 'text'; btn.textContent = '🙈'; }
  else { input.type = 'password'; btn.textContent = '👁'; }
}

// ===== EMOJI PICKER =====
function toggleEmojiPicker() {
  const picker = document.getElementById('emoji-picker');
  if (picker.classList.contains('hidden')) {
    picker.innerHTML = '';
    EMOJIS.forEach(e => {
      const btn = document.createElement('span');
      btn.className = 'emoji-btn-item';
      btn.textContent = e;
      btn.onclick = () => { insertEmoji(e); picker.classList.add('hidden'); };
      picker.appendChild(btn);
    });
    picker.classList.remove('hidden');
  } else {
    picker.classList.add('hidden');
  }
}
function insertEmoji(emoji) {
  const input = document.getElementById('message-input');
  const start = input.selectionStart;
  const val = input.value;
  input.value = val.slice(0, start) + emoji + val.slice(input.selectionEnd);
  input.selectionStart = input.selectionEnd = start + emoji.length;
  input.focus();
}
document.addEventListener('mousedown', (e) => {
  const picker = document.getElementById('emoji-picker');
  if (picker.classList.contains('hidden')) return;
  const emojiBtn = document.querySelector('.emoji-btn');
  if (!picker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
    picker.classList.add('hidden');
  }
});
document.addEventListener('touchstart', (e) => {
  const picker = document.getElementById('emoji-picker');
  if (picker.classList.contains('hidden')) return;
  const emojiBtn = document.querySelector('.emoji-btn');
  if (!picker.contains(e.target) && e.target !== emojiBtn && !emojiBtn.contains(e.target)) {
    picker.classList.add('hidden');
  }
}, { passive: true });

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ===== CREATE ROOM =====
async function createRoom() {
  const roomName = document.getElementById('create-room-name').value.trim();
  const password = document.getElementById('create-password').value;
  const nickname = document.getElementById('create-nickname').value.trim();
  hideError('create-error');

  if (!roomName) return showError('create-error', 'Please enter a room name.');
  if (roomName.length < 2) return showError('create-error', 'Room name too short (min 2 chars).');
  if (!password || password.length < 4) return showError('create-error', 'Password must be at least 4 characters.');
  if (!nickname) return showError('create-error', 'Please enter a nickname.');

  const btn = document.querySelector('.card-create ~ * .submit-btn') || document.querySelector('#create-screen .submit-btn');
  setLoading(btn, true);

  try {
    const res = await fetch('/api/room/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, password, nickname })
    });
    const data = await res.json();
    if (!res.ok) { showError('create-error', data.error || 'Failed to create room.'); return; }
    connectSocket();
    socket.emit('join-room', { roomId: data.roomId, nickname });
    myNickname = nickname;
  } catch (e) {
    showError('create-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

// ===== JOIN ROOM =====
async function joinRoom() {
  const roomName = document.getElementById('join-room-name').value.trim();
  const password = document.getElementById('join-password').value;
  const nickname = document.getElementById('join-nickname').value.trim();
  hideError('join-error');

  if (!roomName) return showError('join-error', 'Please enter the room name.');
  if (!password) return showError('join-error', 'Please enter the password.');
  if (!nickname) return showError('join-error', 'Please enter a nickname.');

  const btn = document.querySelector('#join-screen .submit-btn');
  setLoading(btn, true);

  try {
    const res = await fetch('/api/room/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomName, password })
    });
    const data = await res.json();
    if (!res.ok) { showError('join-error', data.error || 'Invalid credentials.'); return; }
    connectSocket();
    socket.emit('join-room', { roomId: data.roomId, nickname });
    myNickname = nickname;
  } catch (e) {
    showError('join-error', 'Network error. Please try again.');
  } finally {
    setLoading(btn, false);
  }
}

// ===== SOCKET =====
function connectSocket() {
  if (socket) socket.disconnect();
  socket = io();

  socket.on('room-joined', ({ roomId, roomName, nickname, isAdmin, messages, users }) => {
    myRoomId = roomId;
    myNickname = nickname;
    myIsAdmin = isAdmin;

    document.getElementById('sidebar-room-name').textContent = roomName;
    document.getElementById('topbar-room-name').textContent = '# ' + roomName.toLowerCase();
    document.getElementById('my-nick').textContent = nickname;
    document.getElementById('my-avatar').textContent = avatarInitial(nickname);
    document.getElementById('my-role').textContent = isAdmin ? '👑 Admin' : '';

    const area = document.getElementById('messages-area');
    area.innerHTML = `<div class="messages-welcome"><div class="welcome-icon">⬡</div><p>Welcome to <strong>${roomName}</strong></p></div>`;
    messageGroups = {};
    lastSenderNick = null;

    messages.forEach(m => renderMessage(m));
    renderUserList(users);

    showScreen('chat-screen');
    document.getElementById('conn-indicator').classList.remove('disconnected');
    document.getElementById('message-input').focus();
    scrollToBottom();
  });

  socket.on('error', ({ message }) => {
    showToast('⚠ ' + message);
    const joinScreen = document.getElementById('join-screen');
    const createScreen = document.getElementById('create-screen');
    if (joinScreen.classList.contains('active')) showError('join-error', message);
    else if (createScreen.classList.contains('active')) showError('create-error', message);
  });

  socket.on('new-message', (msg) => { renderMessage(msg); scrollToBottom(); });
  socket.on('user-joined', ({ message }) => { renderMessage(message); scrollToBottom(); });
  socket.on('user-left', ({ message }) => { renderMessage(message); scrollToBottom(); });
  socket.on('user-list-update', (users) => { renderUserList(users); });
  socket.on('user-typing', ({ nickname, isTyping }) => { updateTypingIndicator(nickname, isTyping); });

  socket.on('kicked', ({ message }) => {
    showToast('🚫 ' + message);
    setTimeout(() => confirmLeave(), 1500);
  });

  socket.on('disconnect', () => {
    document.getElementById('conn-indicator').classList.add('disconnected');
    showToast('Connection lost. Reconnecting...');
  });

  socket.on('connect', () => {
    document.getElementById('conn-indicator').classList.remove('disconnected');
  });
}

// ===== RENDER MESSAGE =====
let typingUsers = new Set();

function renderMessage(msg) {
  const area = document.getElementById('messages-area');

  if (msg.type === 'system') {
    const el = document.createElement('div');
    el.className = 'sys-msg';
    el.textContent = msg.text;
    area.appendChild(el);
    lastSenderNick = null;
    messageGroups = {};
    return;
  }

  const isMine = msg.nickname === myNickname;
  const groupKey = msg.nickname;
  const lastGroup = messageGroups[groupKey];

  // Only group if the SAME person sent the LAST message (nobody in between)
  const canGroup = lastGroup
    && lastSenderNick === msg.nickname
    && (Date.now() - lastGroup.lastTs < 120000);

  if (canGroup) {
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = linkify(escapeHtml(msg.text));
    lastGroup.el.appendChild(bubble);
    lastGroup.lastTs = msg.timestamp || Date.now();
  } else {
    const group = document.createElement('div');
    group.className = 'msg-group' + (isMine ? ' mine' : '');

    const header = document.createElement('div');
    header.className = 'msg-header';
    const senderSpan = document.createElement('span');
    senderSpan.className = 'msg-sender' + (msg.isAdmin ? ' admin-sender' : '');
    senderSpan.textContent = (msg.isAdmin ? '👑 ' : '') + msg.nickname;
    const timeSpan = document.createElement('span');
    timeSpan.className = 'msg-time';
    timeSpan.textContent = formatTime(msg.timestamp || Date.now());
    header.appendChild(senderSpan);
    header.appendChild(timeSpan);

    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.innerHTML = linkify(escapeHtml(msg.text));

    group.appendChild(header);
    group.appendChild(bubble);
    area.appendChild(group);

    messageGroups = {};
    messageGroups[groupKey] = { el: group, lastTs: msg.timestamp || Date.now() };
  }

  lastSenderNick = msg.nickname;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:var(--accent);">$1</a>');
}

// ===== RENDER USER LIST =====
function renderUserList(users) {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  document.getElementById('topbar-count').textContent = users.length + ' online';

  users.forEach(u => {
    const li = document.createElement('li');
    li.className = 'user-item';

    const avatar = document.createElement('div');
    avatar.className = 'user-avatar' + (u.isAdmin ? ' is-admin' : '');
    avatar.textContent = avatarInitial(u.nickname);

    const name = document.createElement('span');
    name.className = 'user-name';
    name.textContent = u.nickname;
    if (u.isAdmin) {
      const crown = document.createElement('span');
      crown.className = 'admin-crown'; crown.textContent = ' 👑';
      name.appendChild(crown);
    }

    li.appendChild(avatar);
    li.appendChild(name);

    if (myIsAdmin && u.nickname !== myNickname) {
      const kickBtn = document.createElement('button');
      kickBtn.className = 'kick-btn';
      kickBtn.textContent = '✕';
      kickBtn.title = 'Remove user';
      kickBtn.onclick = () => openKickModal(u.nickname);
      li.appendChild(kickBtn);
    }

    list.appendChild(li);
  });
}

// ===== TYPING INDICATOR =====
function updateTypingIndicator(nickname, typing) {
  if (typing) typingUsers.add(nickname);
  else typingUsers.delete(nickname);

  const bar = document.getElementById('typing-bar');
  if (typingUsers.size === 0) bar.textContent = '';
  else if (typingUsers.size === 1) bar.textContent = [...typingUsers][0] + ' is typing...';
  else bar.textContent = [...typingUsers].join(', ') + ' are typing...';
}

// ===== MESSAGE INPUT =====
function handleKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
  const ta = document.getElementById('message-input');
  setTimeout(() => {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  }, 0);
}

function handleTyping() {
  if (!socket || !myRoomId) return;
  if (!isTyping) {
    isTyping = true;
    socket.emit('typing', { roomId: myRoomId, isTyping: true });
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => {
    isTyping = false;
    socket.emit('typing', { roomId: myRoomId, isTyping: false });
  }, 2000);
}

function sendMessage() {
  const input = document.getElementById('message-input');
  const text = input.value.trim();
  if (!text || !socket || !myRoomId) return;

  socket.emit('send-message', { roomId: myRoomId, text });
  input.value = '';
  input.style.height = 'auto';

  clearTimeout(typingTimer);
  if (isTyping) {
    isTyping = false;
    socket.emit('typing', { roomId: myRoomId, isTyping: false });
  }
  input.focus();
}

// ===== KICK MODAL =====
function openKickModal(nickname) {
  kickTargetNickname = nickname;
  document.getElementById('kick-target-name').textContent = nickname;
  document.getElementById('kick-modal').classList.remove('hidden');
}
function closeKickModal() {
  kickTargetNickname = null;
  document.getElementById('kick-modal').classList.add('hidden');
}
function confirmKick() {
  if (!kickTargetNickname || !socket || !myRoomId) return;
  socket.emit('kick-user', { roomId: myRoomId, targetNickname: kickTargetNickname });
  closeKickModal();
}
document.getElementById('kick-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('kick-modal')) closeKickModal();
});

// ===== LEAVE ROOM =====
function leaveRoom() {
  document.getElementById('leave-modal').classList.remove('hidden');
}
function closeLeaveModal() {
  document.getElementById('leave-modal').classList.add('hidden');
}
function confirmLeave() {
  closeLeaveModal();
  if (socket) { socket.disconnect(); socket = null; }
  myRoomId = null; myNickname = null; myIsAdmin = false;
  typingUsers.clear();
  ['create-room-name', 'create-password', 'create-nickname', 'join-room-name', 'join-password', 'join-nickname'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('sidebar').classList.remove('open');
  showScreen('landing-screen');
}
document.getElementById('leave-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('leave-modal')) closeLeaveModal();
});

// ===== SCROLL =====
function scrollToBottom() {
  const area = document.getElementById('messages-area');
  area.scrollTop = area.scrollHeight;
}

// ===== ENTER KEY FOR FORMS =====
document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    if (document.getElementById('create-screen').classList.contains('active')) createRoom();
    else if (document.getElementById('join-screen').classList.contains('active')) joinRoom();
  }
});

// ===== INIT =====
showScreen('landing-screen');