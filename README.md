# ClawControl

A desktop client for OpenClaw AI assistant. Built with Electron, React, and TypeScript.

## Features

- **Chat Interface**: Clean, modern chat UI with message bubbles and streaming support
- **Agent Selection**: Switch between different AI agents
- **Thinking Mode**: Toggle extended thinking for complex tasks
- **Sessions Management**: Create, view, and manage chat sessions
- **Skills Viewer**: Browse available agent skills and their triggers
- **Cron Jobs**: View and manage scheduled tasks
- **Dark/Light Theme**: Full theme support with system preference detection
- **Cross-Platform**: Windows and macOS support

## Screenshots

Open `ui-prototype/index.html` in a browser to preview the UI design.

## Installation

```bash
# Clone the repository
git clone git@github.com:jakeledwards/openclaw-widget.git
cd openclaw-widget

# Install dependencies
npm install

# Run in development mode
npm run dev
```

## Configuration

The app connects to your local OpenClaw instance. Default configuration:
- **Server URL**: `wss://your-server.local` or `ws://localhost:8080`

### Settings Management

You can configure the connection details directly in the application by clicking the **Settings (Gear)** icon in the top bar.

**Available Options:**
1.  **Server URL**: The WebSocket URL of your OpenClaw instance.
    - **Validation**: Must start with `ws://` (insecure) or `wss://` (secure).
    - **Example**: `wss://your-server.local` or `ws://localhost:8080`
2.  **Authentication Mode**: Toggle between Token and Password authentication.
3.  **Gateway Token/Password**: The credential for your OpenClaw instance (if enabled).

Settings are automatically persisted between sessions. If you change the URL or credentials, click **Save & Connect** to apply the changes and attempt a reconnection.

### Authentication Modes

ClawControl supports two authentication modes, matching your server's `gateway.auth.mode` setting:

| Mode | Server Config | Auth Payload |
|------|---------------|--------------|
| **Token** | `gateway.auth.mode = "token"` | `{ token: "your-token" }` |
| **Password** | `gateway.auth.mode = "password"` | `{ password: "your-password" }` |

Select the mode that matches your OpenClaw server configuration.

### Self-Signed Certificates

When connecting to a server with a self-signed or untrusted SSL certificate, you may encounter a certificate error.

**To resolve:**
1. ClawControl will detect the certificate error and show a modal
2. Click "Open URL to Accept Certificate" to open the HTTPS URL in your browser
3. Accept the browser's certificate warning (e.g., "Proceed to site" or "Accept the risk")
4. Close the browser tab and retry the connection in ClawControl


You can change this in the app settings or by modifying `src/store/index.ts`.

## Development

```bash
# Start development server with hot reload
npm run dev

# Run type checking
npm run typecheck

# Run tests
npm run test

# Run tests once
npm run test:run
```

## Building

### Windows (from Windows)

```bash
npm run build:win
```

Output: `release/ClawControl Setup.exe` and `release/ClawControl Portable.exe`

### macOS (from macOS)

```bash
npm run build:mac
```

Output: `release/ClawControl.dmg`

### Cross-Platform Note

Building Windows packages from Linux/WSL requires Wine. For best results:
- Build Windows packages on Windows
- Build macOS packages on macOS

## Project Structure

```
clawcontrol/
├── electron/           # Electron main process
│   ├── main.ts        # Main process entry
│   └── preload.ts     # Preload script (IPC bridge)
├── src/
│   ├── components/    # React components
│   │   ├── ChatArea.tsx
│   │   ├── InputArea.tsx
│   │   ├── RightPanel.tsx
│   │   ├── Sidebar.tsx
│   │   └── TopBar.tsx
│   ├── lib/
│   │   └── openclaw-client.ts  # WebSocket client
│   ├── store/
│   │   └── index.ts   # Zustand state management
│   ├── styles/
│   │   └── index.css  # Main stylesheet
│   ├── App.tsx
│   └── main.tsx
├── ui-prototype/      # Static HTML prototype
└── DESIGN_SPEC.md     # UI design specification
```

## OpenClaw API

ClawControl communicates with OpenClaw using a custom frame-based protocol (v3) over WebSocket. The protocol uses three frame types:

### Frame Types

**Request Frame** - Client to server RPC calls:
```javascript
{
  type: 'req',
  id: '1',
  method: 'chat.send',
  params: { sessionKey: 'session-123', message: 'Hello!' }
}
```

**Response Frame** - Server responses to requests:
```javascript
{
  type: 'res',
  id: '1',
  ok: true,
  payload: { /* result data */ }
}
```

**Event Frame** - Server-pushed events (streaming, presence, etc.):
```javascript
{
  type: 'event',
  event: 'chat',
  payload: { state: 'delta', message: { content: '...' } }
}
```

### Connection Handshake

On connect, the server sends a `connect.challenge` event. The client responds with:
```javascript
{
  type: 'req',
  id: '1',
  method: 'connect',
  params: {
    minProtocol: 3,
    maxProtocol: 3,
    role: 'operator',
    client: { id: 'gateway-client', displayName: 'ClawControl', version: '1.0.0' },
    auth: { token: 'your-token' }  // or { password: 'your-password' }
  }
}
```

### Available Methods

**Sessions**
- `sessions.list` - List all sessions (supports `includeDerivedTitles`, `includeLastMessage`, `limit`)
- `sessions.delete` - Delete a session by key
- `sessions.patch` - Update session properties (e.g., label)

**Chat**
- `chat.send` - Send a message (`sessionKey`, `message`, `thinking`)
- `chat.history` - Get messages for a session

**Agents**
- `agents.list` - List available agents

**Skills**
- `skills.status` - List skills with full metadata (enabled state, requirements, install options)
- `skills.update` - Enable/disable a skill
- `skills.install` - Install a skill

**Cron Jobs**
- `cron.list` - List scheduled jobs
- `cron.get` - Get full cron job details
- `cron.update` - Update job status (active/paused)

### Streaming Events

Chat responses stream via `event` frames:
- `chat` event with `state: 'delta'` - Partial content chunks
- `chat` event with `state: 'final'` - Complete message
- `agent` event with `stream: 'assistant'` - Alternative streaming format

## Tech Stack

- **Electron** - Desktop app framework
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **Zustand** - State management
- **Vitest** - Testing framework

## License

MIT
