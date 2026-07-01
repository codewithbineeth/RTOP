const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-memory store
const rooms = new Map();
// rooms[roomId] = { name, passwordHash, adminSocketId, users: Map<socketId, {nickname, isAdmin}>, messages: [], createdAt }

const socketToRoom = new Map(); // socketId -> roomId

// REST: Check if room exists
app.get('/api/room/:name', (req, res) => {
  const name = req.params.name.toLowerCase().trim();
  const room = [...rooms.values()].find(r => r.name === name);
  res.json({ exists: !!room });
});

// REST: Create room
app.post('/api/room/create', async (req, res) => {
  const { roomName, password, nickname } = req.body;
  if (!roomName || !password || !nickname) {
    return res.status(400).json({ error: 'Missing fields' });
  }
  const name = roomName.toLowerCase().trim();
  const exists = [...rooms.values()].find(r => r.name === name);
  if (exists) return res.status(409).json({ error: 'Room already exists' });

  const passwordHash = await bcrypt.hash(password, 10);
  const roomId = uuidv4();
  rooms.set(roomId, {
    id: roomId,
    name,
    displayName: roomName.trim(),
    passwordHash,
    adminNickname: nickname,
    users: new Map(),
    messages: [],
    createdAt: Date.now()
  });
  res.json({ roomId, roomName: name });
});

// REST: Verify room credentials
app.post('/api/room/verify', async (req, res) => {
  const { roomName, password } = req.body;
  const name = roomName.toLowerCase().trim();
  const room = [...rooms.values()].find(r => r.name === name);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const match = await bcrypt.compare(password, room.passwordHash);
  if (!match) return res.status(401).json({ error: 'Wrong password' });
  res.json({ roomId: room.id, displayName: room.displayName });
});

// Socket.IO
io.on('connection', (socket) => {

  socket.on('join-room', ({ roomId, nickname }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', { message: 'Room not found' });
      return;
    }

    // Check nickname taken
    const taken = [...room.users.values()].find(u => u.nickname.toLowerCase() === nickname.toLowerCase());
    if (taken) {
      socket.emit('error', { message: 'Nickname already taken in this room' });
      return;
    }

    const isAdmin = nickname === room.adminNickname && room.users.size === 0;
    room.users.set(socket.id, { nickname, isAdmin, joinedAt: Date.now() });
    socketToRoom.set(socket.id, roomId);

    socket.join(roomId);

    // Send room history
    socket.emit('room-joined', {
      roomId,
      roomName: room.displayName,
      nickname,
      isAdmin,
      messages: room.messages,
      users: getUserList(room)
    });

    // Notify others
    const systemMsg = createSystemMessage(`${nickname} joined the room`);
    room.messages.push(systemMsg);
    socket.to(roomId).emit('user-joined', {
      nickname,
      isAdmin,
      users: getUserList(room),
      message: systemMsg
    });

    // Broadcast updated user list
    io.to(roomId).emit('user-list-update', getUserList(room));
  });

  socket.on('send-message', ({ roomId, text }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;

    const msg = {
      id: uuidv4(),
      type: 'message',
      nickname: user.nickname,
      isAdmin: user.isAdmin,
      text: text.trim(),
      timestamp: Date.now()
    };
    room.messages.push(msg);
    // Keep last 200 messages
    if (room.messages.length > 200) room.messages = room.messages.slice(-200);

    io.to(roomId).emit('new-message', msg);
  });

  socket.on('typing', ({ roomId, isTyping }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const user = room.users.get(socket.id);
    if (!user) return;
    socket.to(roomId).emit('user-typing', { nickname: user.nickname, isTyping });
  });

  socket.on('kick-user', ({ roomId, targetNickname }) => {
    const room = rooms.get(roomId);
    if (!room) return;
    const kicker = room.users.get(socket.id);
    if (!kicker || !kicker.isAdmin) return;

    const targetEntry = [...room.users.entries()].find(([, u]) => u.nickname === targetNickname);
    if (!targetEntry) return;
    const [targetSocketId] = targetEntry;

    const targetSocket = io.sockets.sockets.get(targetSocketId);
    if (targetSocket) {
      targetSocket.emit('kicked', { message: 'You have been removed by the admin.' });
      targetSocket.leave(roomId);
    }
    room.users.delete(targetSocketId);
    socketToRoom.delete(targetSocketId);

    const sysMsg = createSystemMessage(`${targetNickname} was removed by admin`);
    room.messages.push(sysMsg);
    io.to(roomId).emit('user-left', { nickname: targetNickname, users: getUserList(room), message: sysMsg });
    io.to(roomId).emit('user-list-update', getUserList(room));
  });

  socket.on('disconnect', () => {
    const roomId = socketToRoom.get(socket.id);
    if (!roomId) return;
    const room = rooms.get(roomId);
    if (!room) return;

    const user = room.users.get(socket.id);
    if (user) {
      room.users.delete(socket.id);
      socketToRoom.delete(socket.id);

      if (room.users.size === 0) {
        rooms.delete(roomId);
      } else {
        const sysMsg = createSystemMessage(`${user.nickname} left the room`);
        room.messages.push(sysMsg);
        io.to(roomId).emit('user-left', {
          nickname: user.nickname,
          users: getUserList(room),
          message: sysMsg
        });
        io.to(roomId).emit('user-list-update', getUserList(room));
      }
    }
  });
});

function getUserList(room) {
  return [...room.users.values()].map(u => ({ nickname: u.nickname, isAdmin: u.isAdmin }));
}

function createSystemMessage(text) {
  return { id: uuidv4(), type: 'system', text, timestamp: Date.now() };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
