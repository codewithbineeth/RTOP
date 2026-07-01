# ⬡ NEXUS — Real-Time Room Chat

A production-style ephemeral chat app. No accounts. Rooms vanish when empty.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

## Features
- Create/join password-protected rooms (bcryptjs hashing)
- Real-time messaging via Socket.io
- Typing indicators, user presence, join/leave notifications
- Admin role with kick functionality
- Emoji picker, URL auto-linking, message grouping
- Message history (last 200 msgs, in-memory)
- Rooms auto-deleted when all users leave
- Dark futuristic UI, fully responsive (mobile-ready)

## Tech Stack
- **Backend**: Node.js + Express + Socket.io
- **Security**: bcryptjs password hashing
- **Frontend**: Vanilla HTML/CSS/JS (no framework)
- **Real-time**: Socket.io (WebSockets)

## Project Structure
```
chatapp/
├── server.js          # Express + Socket.io server
├── package.json
└── public/
    ├── index.html     # Single-page app
    ├── style.css      # Dark theme UI
    └── app.js         # Client-side logic
```

## How It Works
1. User creates a room (name + password + nickname) → becomes admin
2. Others join using same room name + password + their own nickname
3. All users chat in real time via WebSocket
4. Admin can kick users
5. Room is automatically destroyed when the last user leaves

## Optional Upgrades
- Add MongoDB for message persistence
- Add file/image sharing
- Deploy to Railway, Render, or Fly.io (runs on PORT env var)
