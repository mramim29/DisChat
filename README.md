# DisChat

A real-time messaging platform with embedded multiplayer games, built as a Progressive Web App (PWA) with a cyberpunk aesthetic. Features global chat, private messaging, group clusters, and interactive Tic-Tac-Toe gameplay—all with offline-first support and push notifications.

[![Node.js](https://img.shields.io/badge/node-%3E%3D14.0.0-brightgreen)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/express-5.2.1-blue)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/socket.io-4.8.3-blueviolet)](https://socket.io/)
[![MongoDB](https://img.shields.io/badge/mongodb-9.5.0-green)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/license-ISC-blue)](#license)

---

##  Features

### Core Messaging
- **Global Chat** — Public broadcast channel accessible to all authenticated users
- **Direct Messages** — Private 1:1 conversations with online/offline status indicators
- **Group Clusters** — Create public or password-protected group channels
- **Message Reactions** — Add emoji reactions to messages with reaction tray display
- **Message Replies** — Quote and reply to specific messages with context preview
- **Delivery & Read Receipts** — Track message status (sent → delivered → read)
- **User Search** — Global search for users and groups with real-time autocomplete

### Advanced Features
- **Embedded Tic-Tac-Toe** — Play multiplayer games within chat rooms with match persistence
- **Presence Tracking** — Real-time online/offline status per room
- **Push Notifications** — Native browser notifications for offline users via Web-Push
- **Message Threading** — Threaded UI with day dividers and timestamp organization
- **Auto-Read Tracking** — Messages marked as read when visible on screen

### User Experience
- **4 Theme Variants** — Cyan (default), Soft, Ocean, Midnight color schemes
- **Customizable Fonts** — 6 font families (JetBrains Mono, Caveat, Inter, Space Grotesk, etc.)
- **Bubble Styles** — Rectangle, rounded, or chat bubble message appearance
- **VIP Effects** — Special effects for VIP users (Neon, Fire, Pulse)
- **Dark Terminal UI** — Immersive cyberpunk retro aesthetic

### PWA Capabilities
- **Offline-First** — Service Worker caches assets for offline access
- **Add to Home Screen** — Install as standalone app on mobile/desktop
- **Background Sync** — Service Worker enables push notifications
- **Responsive Design** — Mobile-optimized with hamburger navigation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend Runtime** | Node.js + Express 5.2 |
| **Real-Time Communication** | Socket.io 4.8.3 |
| **Database** | MongoDB 9.5.0 (Mongoose ODM) |
| **Authentication** | bcrypt + custom session via Socket.io |
| **Push Notifications** | web-push 3.6.7 (VAPID protocol) |
| **Security** | express-rate-limit 8.4.1, dotenv 17.4.2 |
| **Frontend** | Vanilla JavaScript (87KB), CSS Grid, HTML5 |
| **PWA** | Service Worker, Web Manifest, Notification API |

---

## Prerequisites

- **Node.js** v14.0.0 or higher
- **MongoDB** (local or cloud instance via MongoDB Atlas)
- **npm** or yarn
- **Web Push Credentials** (VAPID public/private key pair)

### Generate VAPID Keys

```bash
# Install web-push CLI globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
# Output:
# Public Key: BMjJgE_cppUwWegzl6U6yHIeo_J_0Q8oufr6CII5B8RoZjYwpD4WN_HykdtW7FWBIn0VEUIDFZls-_ZjFe2pN28
# Private Key: your-private-key-here