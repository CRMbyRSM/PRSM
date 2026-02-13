# PRSM

A desktop and mobile client for [OpenClaw](https://github.com/openclaw/openclaw). Built with Electron, React, TypeScript, and Capacitor.

> **OpenClaw** is an open-source AI assistant platform that lets you run, customize, and orchestrate AI agents on your own infrastructure.

PRSM connects to your OpenClaw gateway over WebSocket and gives you a native interface to chat with agents, manage skills and cron jobs, edit workspace files, and record voice notes — on Windows, Linux, and Android.

<p align="center">
  <img src="screenshots/home.png" width="700" alt="PRSM — Main Chat Interface">
  <br><em>Chat interface with session sidebar and skills panel</em>
</p>

---

## Downloads

Grab the latest release from [**GitHub Releases**](https://github.com/CRMbyRSM/PRSM/releases).

| Platform | Artifact | Description |
|----------|----------|-------------|
| Windows | `PRSM-Setup-{version}.exe` | NSIS installer — installs to Program Files, creates shortcuts |
| Windows | `PRSM-Portable-{version}.exe` | Single-file portable — no installation needed |
| Linux | `PRSM-{version}-linux-x64.AppImage` | AppImage — `chmod +x` and run |
| Android | `PRSM-{version}-android.apk` | APK — sideload on any Android device |

---

## Features

### Chat & Messaging
- **Real-time streaming** — responses render token-by-token as the agent thinks
- **Image attachments** — paste from clipboard, drag-and-drop, or pick from file system (auto-compressed to stay under the 25 MB WebSocket limit)
- **Voice notes** — record audio, transcribe via any Whisper-compatible STT service, insert as text
- **Pinned messages** — star important messages; pins persist locally across sessions
- **Full markdown rendering** — fenced code blocks with syntax highlighting, tables, links, lists
- **Thinking mode toggle** — enable extended thinking; reasoning steps render as compact, collapsible blocks
- **Ctrl+Enter to send** — on desktop, Enter inserts a newline; Ctrl+Enter sends the message

### Sessions
- **Multi-session management** — create, switch, rename, and delete chat sessions
- **Name sessions on creation** — optionally label a new chat when you start it
- **Session search/filter** — search sessions by name in the sidebar

### Agents & Workspace
- **Agent profiles** — view and edit agent workspace files (SOUL.md, MEMORY.md, ACTIVE-WORK.md, etc.)
- **Multi-agent switching** — switch between agents from the sidebar

### Skills & Automation
- **Skills browser** — browse all installed skills with status badges (Ready / Missing / Disabled)
- **Skill details** — view documentation, required binaries, enable/disable
- **Cron job viewer** — inspect scheduled tasks, job configuration, and run history

### Desktop & Mobile Experience
- **Dark & light themes** — toggle manually or follow system preference
- **Desktop notifications** — get notified when an agent responds in the background
- **Secure token storage** — credentials encrypted via Electron's `safeStorage` API
- **Heartbeat filtering** — background heartbeat messages hidden from the chat feed
- **Auto-updater** — check for updates from the sidebar; configurable update policy
- **Mobile-optimized UI** — responsive layout with slide-out panels, mobile keyboard handling, and touch-friendly controls
- **Cross-platform** — Windows, Linux, and Android from a single codebase

<details>
<summary><strong>Screenshots</strong></summary>

<p align="center">
  <img src="screenshots/agent.png" width="600" alt="Agent Profile">
  <br><em>Agent profile and workspace file editor</em>
</p>

<p align="center">
  <img src="screenshots/skills.png" width="600" alt="Skills Panel">
  <br><em>Skill detail view with status and documentation</em>
</p>

<p align="center">
  <img src="screenshots/cronjob.png" width="600" alt="Cron Jobs">
  <br><em>Cron job viewer with run history</em>
</p>

<p align="center">
  <img src="screenshots/connect.png" width="600" alt="Connection Settings">
  <br><em>Connection and STT settings</em>
</p>

</details>

---

## Quick Start

### 1. Install

Download the artifact for your platform from the [Releases](https://github.com/CRMbyRSM/PRSM/releases) page.

- **Windows Installer** — run the `.exe`, follow the wizard.
- **Windows Portable** — just run the `.exe` from any folder.
- **Linux** — `chmod +x PRSM-*.AppImage && ./PRSM-*.AppImage`
- **Android** — enable "Install from unknown sources," then open the APK.

### 2. Connect

1. Open PRSM — on first launch it shows the connection dialog.
2. Enter your **OpenClaw Gateway URL** (e.g., `ws://192.168.1.50:18789` or `wss://your-server.com`).
3. Enter your **Gateway Token** or **Password** (depending on your gateway's `auth.mode`).
4. Click **Save & Connect**.

### 3. Chat

Start a new session, pick an agent, and go. Messages stream in real-time. Use the right panel to browse skills, view cron jobs, or manage pinned messages.

---

## Voice Notes

Voice notes let you record audio and have it transcribed to text using any Whisper-compatible speech-to-text (STT) service. Click the microphone button in the input area to configure — or click **"Ask your assistant for help"** and the agent will walk you through it.

### Configuration

Three fields to fill in:

| Field | What it is |
|-------|-----------|
| **Endpoint URL** | Full URL to the `/v1/audio/transcriptions` endpoint |
| **Model** | The transcription model name |
| **API Key** | Only needed for OpenAI or other protected endpoints |

### Provider Guides

<details>
<summary><strong>OpenAI Whisper API</strong> — Easiest, paid ($0.006/min)</summary>

1. Get an API key at [platform.openai.com](https://platform.openai.com/api-keys)
2. Configure:
   - **URL:** `https://api.openai.com/v1/audio/transcriptions`
   - **Model:** `whisper-1`
   - **API Key:** your OpenAI API key

No setup, no servers. Just works. Costs roughly $0.006 per minute of audio.
</details>

<details>
<summary><strong>Speaches</strong> — Self-hosted, GPU-accelerated, free</summary>

Run on any machine with a GPU (even a modest one):

```bash
docker run -d --gpus all -p 8000:8000 \
  ghcr.io/speaches-ai/speaches:latest-cuda
```

Configure:
- **URL:** `http://<your-server-ip>:8000/v1/audio/transcriptions`
- **Model:** `Systran/faster-whisper-large-v3` (or any supported model)
- **API Key:** leave empty

CPU-only (slower but no GPU needed):
```bash
docker run -d -p 8000:8000 \
  ghcr.io/speaches-ai/speaches:latest
```

See [Speaches docs](https://github.com/speaches-ai/speaches) for model options.
</details>

<details>
<summary><strong>LocalAI</strong> — Self-hosted, CPU or GPU, free</summary>

```bash
docker run -d -p 8080:8080 localai/localai:latest
```

Configure:
- **URL:** `http://<your-server-ip>:8080/v1/audio/transcriptions`
- **Model:** `whisper-1`
- **API Key:** leave empty

See [LocalAI docs](https://localai.io/features/audio-to-text/) for setup details.
</details>

<details>
<summary><strong>Groq</strong> — Cloud, very fast, free tier available</summary>

1. Get an API key at [console.groq.com](https://console.groq.com/keys)
2. Configure:
   - **URL:** `https://api.groq.com/openai/v1/audio/transcriptions`
   - **Model:** `whisper-large-v3-turbo`
   - **API Key:** your Groq API key

Free tier includes audio transcription. Very fast inference.
</details>

### Recording Behavior

| Action | Behavior |
|--------|----------|
| **Max duration** | 2 minutes — auto-stops with a countdown warning |
| **Silence detection** | 8+ seconds of silence → auto-stop and transcribe |
| **Cancel (✕)** | Discard recording without transcribing |
| **Stop (■)** | Stop and transcribe immediately |

---

## Build from Source

```bash
# Clone
git clone https://github.com/CRMbyRSM/PRSM.git
cd PRSM

# Install dependencies
npm install

# Development (Vite hot reload + Electron)
npm run dev

# Build for a single platform
npm run build:win        # Windows (Setup + Portable)
npm run build:linux      # Linux (AppImage)
npm run build:mac        # macOS (DMG)
npm run build:all        # Windows + Linux

# Full release build (all desktop + Android APK)
npm run build:release
```

### Android Build

```bash
# Build web assets and sync to Android project
npm run mobile:sync

# Open in Android Studio
npm run mobile:android

# Or build the APK directly
cd android && ./gradlew assembleDebug
```

### Requirements

| Dependency | Version |
|------------|---------|
| Node.js | 18+ |
| npm | 9+ |
| Android Studio | Latest (for Android builds) |
| Java JDK | 17+ (for Android builds) |

---

## Architecture

```
PRSM/
├── electron/              # Electron main process
│   ├── main.ts                # App lifecycle, auto-updater, safeStorage
│   └── preload.ts             # Context bridge (IPC to renderer)
├── src/
│   ├── App.tsx                # Root component, routing
│   ├── main.tsx               # Entry point
│   ├── components/
│   │   ├── ChatArea.tsx           # Message list, markdown rendering, thinking blocks
│   │   ├── InputArea.tsx          # Message input, attachments, voice recording
│   │   ├── Sidebar.tsx            # Session list, search, agent selector, update button
│   │   ├── TopBar.tsx             # Connection status, theme toggle
│   │   ├── RightPanel.tsx         # Skills, cron jobs, pinned messages tabs
│   │   ├── SettingsModal.tsx      # Connection + STT configuration
│   │   ├── VoiceSettings.tsx      # STT provider setup
│   │   ├── AgentDetailView.tsx    # Agent profile and workspace file editor
│   │   ├── SkillDetailView.tsx    # Skill docs and status
│   │   ├── CronJobDetailView.tsx  # Cron job config and run history
│   │   ├── SubagentBlock.tsx      # Sub-agent activity display
│   │   ├── UpdateBanner.tsx       # Update notification banner
│   │   ├── CertErrorModal.tsx     # TLS certificate error handling
│   │   └── ErrorBoundary.tsx      # React error boundary
│   ├── store/
│   │   └── index.ts           # Zustand state (sessions, settings, pins — persisted to localStorage)
│   ├── lib/
│   │   ├── openclaw-client.ts # WebSocket client for the OpenClaw gateway protocol
│   │   ├── platform.ts        # Platform abstraction (Electron / Capacitor / web)
│   │   └── safe-render.ts     # XSS sanitization for rendered content
│   ├── styles/
│   │   └── index.css          # CSS with custom properties for dark/light theming
│   └── test/
│       └── setup.ts           # Vitest test setup
├── android/                   # Capacitor Android project
├── scripts/                   # Build and test utilities
├── screenshots/               # README screenshots
└── prsm-icons/                # App icons (all platforms)
```

The app communicates with the OpenClaw gateway over a single persistent WebSocket connection. All messages, sessions, skills, cron data, and agent workspace files flow through this connection using OpenClaw's native protocol.

---

## Testing

```bash
npm test              # Watch mode
npm run test:run      # Single run
npm run test:coverage # With coverage report
npm run typecheck     # TypeScript type checking
npm run lint          # ESLint
```

---

## Acknowledgments

PRSM is forked from [ClawControl](https://github.com/jakeledwards/ClawControl) by **Jacob L. Edwards / Oaken Cloud Technologies, LLC**. The original project provided the foundation that PRSM builds on.

Built for the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem. Join the community on [Discord](https://discord.com/invite/clawd).

Developed and maintained by **RSM Consulting** — [crmbyrsm.com](https://crmbyrsm.com).

## License

MIT — see [LICENSE](LICENSE) for details.
