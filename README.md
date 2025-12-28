# Zync: Zero-Latency Audio Sync

**Zync** is a professional-grade web application capable of synchronizing audio playback across multiple devices with millisecond precision over a local network or the internet. It transforms any collection of laptops, phones, and tablets into a unified sound system.

![Zync UI](https://via.placeholder.com/800x400?text=Zync+Audio+Sync)

## ✨ Features

*   **Precision Synchronization**: Custom NTP-like protocol ensures playback is synced within ~5-20ms across devices.
*   **Host Management**: Centralized control panel for the host to upload tracks, seek, pause, and adjust volume.
*   **Device Orchestration**: View all connected devices, their latency, and remotely control their volume.
*   **Cross-Platform**: Works seamlessly on iOS (iPhone/iPad), Android, MacOS, Windows, and Linux.
*   **Visualizer**: Real-time audio visualization using the Web Audio API.
*   **Progressive Web App**: responsive, mobile-first design.

---

## 🚀 Local Development

To run Zync on your machine for development or local usage:

### Prerequisites
*   **Node.js** (v18+)
*   **npm** or **yarn**

### 1. Installation
Clone the repository and install dependencies for both client and server:

```bash
# Install root/server dependencies
cd server
npm install

# Install client dependencies
cd ../client
npm install
```

### 2. Start the Server
The server handles the WebSocket connections and audio buffering.

```bash
cd server
npm start
# Server runs on http://localhost:3000
```

### 3. Start the Client
Run the modern React frontend.

```bash
cd client
npm run dev -- --host
# Client runs on http://localhost:5173
```

**Connecting Devices Locally:**
1.  Check the `client` terminal output for the **Network URL** (e.g., `http://192.168.1.XX:5173/`).
2.  Open this URL on any device connected to the same Wi-Fi.

---

## ☁️ Deployment Guide (Go Live)

To deploy Zync to the public internet, you need to deploy the **Server** and **Client** separately due to the requirement for persistent WebSocket connections.

### 1. Deploy Server (Backend)
The server requires a platform that supports **persistent processes** (WebSockets) and **memory retention**.
**Recommended Platforms**: [Render](https://render.com), [Railway](https://railway.app), or [Fly.io](https://fly.io).

**Steps for Render:**
1.  Push your code to GitHub.
2.  Create a new **Web Service** on Render.
3.  Connect your repository.
4.  **Root Directory**: `server`
5.  **Build Command**: `npm install`
6.  **Start Command**: `node index.js`
7.  Deploy. You will get a URL like `https://zync-server.onrender.com`.

### 2. Deploy Client (Frontend) - Vercel
Vercel is the perfect host for the React frontend.

1.  Push your code to GitHub.
2.  Import the project into **Vercel**.
3.  **Root Directory**: `client`
4.  **Framework Preset**: Vite (Automatic).
5.  **Environment Variables**:
    You MUST connect the client to your deployed server. Add the following environment variable in the Vercel project settings:
    
    *   **Name**: `VITE_SERVER_URL`
    *   **Value**: `https://zync-server.onrender.com` (Your backend URL from Step 1)

6.  Deploy.

### 3. Verification
*   Open your Vercel URL (e.g., `https://zync.vercel.app`).
*   It should show "Online" in the status indicator.
*   If it says "Connecting...", check that your `VITE_SERVER_URL` is correct and the server is running.

---

## 🛠 Architecture & Troubleshooting

**Why can't I deploy the server to Vercel?**
Vercel uses "Serverless Functions" which spin down immediately after a request finishes. Zync requires a **continuous WebSocket connection** to keep clocks synchronized and memory to hold the uploaded audio file. A standard server (VPS/Container) is required for this logic.

**Common Issues:**
*   **iPhone Audio**: Enable the "Silent Mode" switch on the side of your phone to OFF, or ensure you tap the "Enable Audio" button on the Zync interface. iOS blocks auto-playing audio.
*   **Sync Drift**: High network jitter can cause drift. Press the "Resync" button on the client to re-calculate the time offset.

## 📄 License
MIT License.
