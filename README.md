# DisChat

A real-time messaging platform with embedded multiplayer games, built as a Progressive Web App (PWA). Features include global chat rooms, direct messaging, group clusters, and interactive Tic-Tac-Toe gameplay with offline support and push notifications.

[![Node.js](https://img.shields.io/badge/Node.js-v14+-brightgreen)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-5.2.1-blue)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8.3-blueviolet)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/MongoDB-9.5.0-green)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/License-ISC-blue)](#license)

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Security](#security)
- [Deployment](#deployment)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Features

### Messaging
- Global chat channel accessible to all authenticated users
- Private direct messages with online/offline status indicators
- Public and password-protected group clusters
- Message reactions with emoji support
- Reply to specific messages with context preview
- Delivery and read receipts for all messages
- Real-time user search across users and groups

### Interactive Gaming
- Embedded Tic-Tac-Toe with multiplayer support
- Games persist within chat threads
- Open challenges or targeted duels within groups
- Match history stored in database

### User Experience
- Multiple theme options: Cyan, Soft, Ocean, Midnight
- Customizable fonts: JetBrains Mono, Caveat, Inter, Space Grotesk, Chelsea Market, Trispace
- Message bubble styling options
- VIP user effects and badges
- Terminal-inspired dark UI

### Progressive Web App
- Service Worker for offline access and caching
- Push notifications for offline users
- Installable as standalone app
- Mobile-responsive design
- Background synchronization

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Backend Runtime | Node.js + Express 5.2 |
| Real-Time Communication | Socket.io 4.8.3 |
| Database | MongoDB 9.5.0 with Mongoose ODM |
| Authentication | bcrypt + Socket.io session management |
| Push Notifications | web-push 3.6.7 (VAPID protocol) |
| Security | express-rate-limit 8.4.1, dotenv 17.4.2 |
| Frontend | Vanilla JavaScript (87KB), CSS Grid, HTML5 |
| PWA | Service Worker, Web Manifest, Notification API |

## Prerequisites

- Node.js v14.0.0 or higher
- MongoDB (local installation or MongoDB Atlas cloud instance)
- npm or yarn
- Web Push credentials (VAPID key pair)

### Generate VAPID Keys

Install web-push CLI globally:
```bash
npm install -g web-push
```

Generate your VAPID keys:
```bash
web-push generate-vapid-keys
```

Save the generated public and private keys for use in your `.env` file.

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/mramim29/DisChat.git
cd DisChat
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Environment Configuration

Create a `.env` file in the project root directory:

```env
# Server configuration
PORT=3000
NODE_ENV=development

# Database connection
MONGO_URI=mongodb://localhost:27017/dischat_data
# For MongoDB Atlas: mongodb+srv://username:password@cluster0.mongodb.net/dischat_data

# Web Push configuration
VAPID_EMAIL=your-email@example.com
VAPID_PUBLIC_KEY=your-public-key-here
VAPID_PRIVATE_KEY=your-private-key-here
```

### 4. Start MongoDB

**Local MongoDB Installation:**

macOS with Homebrew:
```bash
brew services start mongodb-community
```

Linux:
```bash
sudo systemctl start mongod
```

Windows (as Administrator):
```bash
net start MongoDB
```

**MongoDB Atlas (Cloud):**
Update the `MONGO_URI` in your `.env` file with your cloud connection string.

### 5. Start the Application

```bash
npm start
```

The server will initialize and display:
```
>>> [DISCHAT_CORE_v3.0] Server initialized on port 3000
>>> [SYSTEM_CORE]: DATABASE_ONLINE
>>> [PUSH_SYSTEM]: Web-Push configured successfully.
```

### 6. Access the Application

Open your web browser and navigate to:
```
http://localhost:3000
```

## Usage

### Initial Setup

1. On first load, review the user manual explaining core features
2. Create a new account using the Register tab
3. Wait for admin approval (all new registrations require authorization)
4. Log in with your approved credentials
5. Customize your interface settings (theme, font, bubble style)

### Global Chat

Join the public broadcast channel accessible to all users:
- Navigate to Sidebar > GLOBAL > GLOBAL CHAT
- Messages are visible to all authenticated users
- Support for reactions, replies, and delivery receipts

### Direct Messages

Start a private 1:1 conversation:
- Use the search bar to find users
- Select a user from search results
- Messages are private between participants
- Online/offline status displayed in real-time

### Group Clusters

Create and manage group channels:
- Click the + button next to CLUSTERS in sidebar
- Enter cluster name and visibility settings
- Set password for private clusters
- Invite specific users to join

### Tic-Tac-Toe Gaming

Play games within chat rooms:
- Click the DUEL button in room header
- Select your game piece (X or O)
- For groups: choose to challenge anyone or specific user
- Board state persists in message history
- Game results displayed with system notifications

### Customization

Personalize your interface:
- Click your avatar (top-left corner)
- Select preferred theme, font, and bubble style
- VIP users: enable special effects (Neon, Fire, Pulse)
- Changes persist in browser localStorage

## Project Structure

```
DisChat/
├── server.js                    # Main backend server
│                               # Schemas and Socket.io handlers
│
├── public/                      # Frontend PWA assets
│   ├── index.html              # HTML entry point
│   ├── script.js               # Client-side logic
│   ├── style.css               # Terminal UI styling
│   ├── sw.js                   # Service Worker
│   ├── manifest.json           # PWA manifest
│   ├── favicon.ico             # Application icon
│   └── notificaion/            # Push notification assets
│
├── package.json                # Project dependencies
├── package-lock.json           # Dependency lock file
├── .env                        # Environment variables (create this)
├── .gitignore                  # Git ignore rules
└── README.md                   # This file
```

## API Documentation

### Authentication Events

#### login
Authenticate user with credentials.

Request:
```javascript
socket.emit('login', {
    username: 'alice',
    password: 'secret'
});
```

Response:
```javascript
socket.on('login_success', (data) => {
    // { username: 'alice', groups: [...], isVip: false }
});

socket.on('auth_status', (data) => {
    // { ok: false, m: 'PASSKEY_REJECTED' }
});
```

#### register
Create a new user account (requires admin approval).

Request:
```javascript
socket.emit('register', {
    username: 'bob',
    password: 'secret123'
});
```

### Messaging Events

#### send_msg
Send a message to a room.

Request:
```javascript
socket.emit('send_msg', {
    room: 'global',
    roomName: 'GLOBAL CHAT',
    text: 'Hello everyone!',
    replyTo: {
        msgId: '507f1f77bcf86cd799439011',
        sender: 'alice',
        text: 'Original message'
    }
});
```

Response:
```javascript
socket.on('new_msg', (msg) => {
    // Message object with _id, sender, text, timestamp, reactions, etc.
});
```

#### message_reaction
Add emoji reaction to a message.

Request:
```javascript
socket.emit('message_reaction', {
    msgId: '507f1f77bcf86cd799439012',
    emoji: '🔥'
});
```

Response:
```javascript
socket.on('reaction_updated', ({ msgId, reactions }) => {
    // reactions: [{ username: 'alice', emoji: '👍' }, ...]
});
```

#### message_delivered / message_read
Update message delivery and read status.

Request:
```javascript
socket.emit('message_delivered', { msgId: '507f1f77bcf86cd799439012' });
socket.emit('message_read', { msgId: '507f1f77bcf86cd799439012' });
```

### Group Events

#### create_cluster
Create a new group channel.

Request:
```javascript
socket.emit('create_cluster', {
    groupName: 'Web Developers',
    isPublic: true,
    password: ''
});
```

#### invite_to_cluster
Add a user to a group.

Request:
```javascript
socket.emit('invite_to_cluster', {
    roomId: 'CLUSTER_a1b2c3d4e5',
    targetUsername: 'charlie'
});
```

### Game Events

#### create_match
Start a new Tic-Tac-Toe game.

Request:
```javascript
socket.emit('create_match', {
    roomId: 'global',
    chosenSign: 'X',
    targetUser: 'enclave_challenger'
});
```

#### make_move
Place a mark on the game board.

Request:
```javascript
socket.emit('make_move', {
    matchId: '507f1f77bcf86cd799439013',
    index: 4
});
```

Response:
```javascript
socket.on('match_updated', (match) => {
    // Match object with board state, turn, status, winner
});
```

## Database Schema

### User Collection
```javascript
{
  _id: ObjectId,
  username: String,           // Unique, lowercase
  password: String,           // Plain text (SECURITY: Should use bcrypt)
  isApproved: Boolean,        // Admin approval required
  isVip: Boolean,             // VIP user flag
  groups: [
    {
      roomId: String,
      groupName: String,
      isDM: Boolean
    }
  ],
  createdAt: Date,
  updatedAt: Date
}
```

### Group Collection
```javascript
{
  _id: ObjectId,
  roomId: String,             // Unique identifier
  groupName: String,
  isPublic: Boolean,
  password: String,           // Empty if public
  createdBy: String,          // Creator username
  members: [String],          // Member usernames
  createdAt: Date,
  updatedAt: Date
}
```

### Message Collection
```javascript
{
  _id: ObjectId,
  room: String,               // Room or cluster ID
  roomName: String,
  sender: String,
  text: String,
  isVip: Boolean,
  timestamp: Date,
  delivered: [String],        // Usernames who received
  read: [String],             // Usernames who read
  reactions: [
    {
      username: String,
      emoji: String
    }
  ],
  replyTo: {
    msgId: ObjectId,
    sender: String,
    text: String
  },
  type: String,               // 'TEXT' or 'TICTACTOE'
  matchId: ObjectId
}
```

### Match Collection
```javascript
{
  _id: ObjectId,
  roomId: String,
  playerX: String,
  playerO: String,
  board: [String],            // 9-element array
  turn: String,               // 'X' or 'O'
  status: String,             // 'ACTIVE', 'WON', 'DRAW', 'TIMEOUT'
  winner: String,
  createdAt: Date,
  updatedAt: Date
}
```

## Security

### Current Implementation
- Regex injection protection for search queries
- Rate limiting library installed
- CORS configuration for development
- Socket.io connection-based authentication

### Known Security Issues

| Issue | Severity | Recommendation |
|-------|----------|-----------------|
| Passwords stored in plain text | Critical | Implement bcrypt hashing |
| No input validation on requests | Critical | Use express-validator |
| Missing rate limiting on auth routes | Critical | Configure express-rate-limit |
| No HTTPS enforcement in production | Critical | Deploy behind reverse proxy |
| Generic error messages | High | Use consistent error codes |
| No request logging | High | Integrate Winston or Pino logger |
| N+1 database queries | High | Optimize with indexes |

### Security Recommendations

Before production deployment:
- Enable HTTPS/TLS
- Hash all passwords with bcrypt (cost factor >= 10)
- Implement rate limiting on authentication routes
- Configure MongoDB with authentication
- Add input validation to all endpoints
- Implement centralized error logging
- Create database indexes on frequently queried fields
- Use environment-specific configurations
- Rotate VAPID keys periodically
- Set secure cookie flags

## Deployment

### Heroku Deployment

1. Install Heroku CLI:
```bash
brew tap heroku/brew && brew install heroku
```

2. Create application:
```bash
heroku create your-app-name
```

3. Set environment variables:
```bash
heroku config:set MONGO_URI=mongodb+srv://...
heroku config:set VAPID_PUBLIC_KEY=your-key
heroku config:set VAPID_PRIVATE_KEY=your-key
heroku config:set VAPID_EMAIL=your-email@example.com
```

4. Deploy:
```bash
git push heroku main
```

### Docker Deployment

Create `Dockerfile`:
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

Build and run:
```bash
docker build -t dischat .
docker run -p 3000:3000 --env-file .env dischat
```

### Manual VPS Deployment

1. Install Node.js and MongoDB on your server
2. Clone repository
3. Install dependencies: `npm install`
4. Configure `.env` with production values
5. Use process manager (PM2):
```bash
npm install -g pm2
pm2 start server.js --name dischat
pm2 startup
pm2 save
```

## Troubleshooting

### Database Connection Failed

Verify MongoDB is running and connection string is correct:
```bash
# Test connection
mongo "mongodb://localhost:27017/dischat_data"
```

Check `.env` file MONGO_URI value matches your MongoDB setup.

### Push Notifications Not Working

Ensure VAPID keys are properly configured:
```bash
# Regenerate keys if needed
web-push generate-vapid-keys
```

Update `.env` with new keys and restart server.

### Service Worker Not Registering

Service Worker requires HTTPS in production or localhost in development.

Check browser console for errors:
```javascript
navigator.serviceWorker.getRegistrations().then(regs => console.log(regs));
```

### User Registration Pending Approval

New users require admin approval before login:
```bash
# Connect to MongoDB
mongo dischat_data

# Approve user
db.users.updateOne({ username: 'alice' }, { $set: { isApproved: true } })
```

## Contributing

1. Fork the repository
2. Create feature branch: `git checkout -b feature/feature-name`
3. Commit changes: `git commit -m 'Add feature'`
4. Push to branch: `git push origin feature/feature-name`
5. Submit Pull Request

## Roadmap

- User profile customization
- Advanced message search and filtering
- Typing indicators
- Message editing and deletion
- User blocking and muting
- Admin moderation dashboard
- End-to-end encryption
- Voice and video calling
- Custom emojis and stickers
- Message pinning in groups
- Role-based permissions system

## License

ISC License - see LICENSE file for details.

## Author

Mohammad Ramim

- GitHub: [mramim29](https://github.com/mramim29)
- Repository: [DisChat](https://github.com/mramim29/DisChat)

## Support

For issues and questions:
- Open an issue: [GitHub Issues](https://github.com/mramim29/DisChat/issues)
- Start a discussion: [GitHub Discussions](https://github.com/mramim29/DisChat/discussions)

---

Last Updated: July 2024
Version: 6.0.40_N
Status: Active Development
