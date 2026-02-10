# ClawControlRSM

A desktop client for [OpenClaw](https://github.com/openclaw/openclaw) — the open-source AI assistant platform. Built with Electron, React, and TypeScript.

Connect to your OpenClaw gateway, chat with your agents, manage skills and cron jobs, and record voice notes — all from a native desktop app.

<p align="center">
  <img src="screenshots/home.png" width="700" alt="Main Chat Interface">
  <br><em>Chat interface with session sidebar and skills panel</em>
</p>

## Features

### Chat
- **Real-time streaming** — responses stream in as the agent thinks
- **Image attachments** — paste, drag-and-drop, or pick images (auto-compressed to stay under the 25MB WebSocket limit)
- **Voice notes** — record audio, transcribe via any Whisper-compatible STT service, insert as text
- **Pinned messages** — star important messages across sessions, persisted locally
- **Markdown rendering** — code blocks, tables, links, lists
- **Thinking mode** — toggle extended thinking for complex tasks

### Agent Management
- **Multi-session** — create, switch, rename, and delete chat sessions
- **Agent profiles** — view and edit agent workspace files (SOUL.md, MEMORY.md, etc.)
- **Agent switching** — switch between agents if you run multiple

### Skills & Automation
- **Skills browser** — view all installed skills with status badges (Ready / Missing / Disabled)
- **Skill details** — see documentation, required binaries, enable/disable skills
- **Cron jobs** — view scheduled tasks, run history, and job configuration

### Desktop Experience
- **Dark & light themes** — toggle or follow system preference
- **Desktop notifications** — get notified when an agent responds (even when the app is in the background)
- **Secure token storage** — credentials encrypted via Electron's `safeStorage` API
- **Heartbeat filtering** — background heartbeat messages hidden from the chat UI
- **Cross-platform** — Windows (Setup + Portable), Linux (AppImage), macOS (DMG)

<details>
<summary><strong>More screenshots</strong></summary>

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

## Quick Start

### Download

Grab the latest release for your platform from [Releases](https://github.com/CRMbyRSM/ClawControlRSM/releases):

| Platform | Format |
|----------|--------|
| Windows  | Setup (NSIS installer) or Portable (.exe) |
| Linux    | AppImage |
| macOS    | DMG |

### Connect

1. Open the app — it'll show the connection settings on first launch
2. Enter your **OpenClaw Gateway URL** (e.g., `ws://192.168.1.50:18789` or `wss://your-server.com`)
3. Enter your **Gateway Token** or **Password** (depending on your gateway's `auth.mode`)
4. Click **Save & Connect**

### Voice Notes (Optional)

Voice notes require a Whisper-compatible speech-to-text service. In Settings, configure:

- **STT Endpoint URL** — the `/v1/audio/transcriptions` endpoint
- **STT Model** — model name (e.g., `whisper-large-v3`)
- **API Key** — only needed for OpenAI or protected endpoints

Works with:
- [OpenAI Whisper API](https://platform.openai.com/docs/guides/speech-to-text) (paid, easy setup)
- [Speaches](https://github.com/speaches-ai/speaches) (self-hosted, GPU-accelerated)
- [LocalAI](https://localai.io/) (self-hosted, CPU or GPU)
- Any OpenAI-compatible STT endpoint

If no STT service is configured, the mic button appears greyed out with a tooltip pointing you to Settings.

## Build from Source

```bash
# Clone
git clone https://github.com/CRMbyRSM/ClawControlRSM.git
cd ClawControlRSM

# Install dependencies
npm install

# Development (hot reload)
npm run dev

# Build for your platform
npm run build:win      # Windows (Setup + Portable)
npm run build:linux    # Linux (AppImage)
npm run build:mac      # macOS (DMG)
npm run build:all      # Windows + Linux
```

### Requirements

- Node.js 18+
- npm 9+
- For Windows builds: Windows or WSL
- For macOS builds: macOS with Xcode CLI tools

## Architecture

```
src/
├── components/        # React UI components
│   ├── ChatArea.tsx       # Message display with markdown rendering
│   ├── InputArea.tsx      # Message input, attachments, voice recording
│   ├── Sidebar.tsx        # Session list, agent selector
│   ├── RightPanel.tsx     # Skills, cron jobs, pinned messages tabs
│   ├── SettingsModal.tsx  # Connection + STT configuration
│   └── ...
├── store/             # Zustand state management (persisted to localStorage)
├── lib/
│   ├── openclaw-client.ts  # WebSocket client for OpenClaw gateway
│   ├── platform.ts         # Platform abstraction (Electron/Capacitor/web)
│   └── safe-render.ts      # XSS sanitization for rendered content
├── styles/            # CSS (no preprocessor, CSS custom properties for theming)
└── electron/          # Electron main process + preload
```

The app communicates with OpenClaw via WebSocket using the gateway's native protocol. All messages, sessions, skills, and cron data flow through a single persistent connection.

## Mobile (Experimental)

A Capacitor scaffold exists for iOS/Android but is not yet production-ready:

```bash
npm run mobile:dev      # Browser preview
npm run mobile:sync     # Build + sync to native projects
npm run mobile:ios      # Open in Xcode
npm run mobile:android  # Open in Android Studio
```

## Acknowledgments

Forked from [ClawControl](https://github.com/jakeledwards/ClawControl) by Jacob L. Edwards / Oaken Cloud Technologies, LLC.

Built for the [OpenClaw](https://github.com/openclaw/openclaw) ecosystem. Join the community on [Discord](https://discord.com/invite/clawd).

## License

MIT — see [LICENSE](LICENSE) for details.
