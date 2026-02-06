# OpenClaw API Integration Strategy

## 1. Endpoint Discovery
The OpenClaw Gateway operates as a WebSocket server.
- **Default Endpoint:** `ws://localhost:18789` (Local)
- **Production Endpoint:** `wss://<hostname>`
- **Discovery Mechanism:** Manual configuration via UI Settings.

## 2. Authentication Methods
Authentication is handled via the JSON-RPC protocol immediately after the WebSocket connection is established.

**Protocol:**
1. **Connect** to WebSocket URL.
2. **Send `auth.login`** request with the Gateway Token.

```json
{
  "jsonrpc": "2.0",
  "method": "auth.login",
  "params": {
    "token": "YOUR_GATEWAY_TOKEN"
  },
  "id": 1
}
```

- **Token Storage:** Persisted in local storage (`clawcontrol-storage`).
- **Token Source:** Found in `~/.config/openclaw/config.json` on the server machine.

## 3. Data Schema Mapping
We map OpenClaw's JSON-RPC events to our internal TypeScript interfaces.

| OpenClaw Entity | Internal Interface | File |
|-----------------|-------------------|------|
| `session` | `Session` | `src/lib/openclaw-client.ts` |
| `message` | `Message` | `src/lib/openclaw-client.ts` |
| `agent` | `Agent` | `src/lib/openclaw-client.ts` |
| `skill` | `Skill` | `src/lib/openclaw-client.ts` |

**Key Mappings:**
- **Sessions:** `sessions.list` -> `Session[]`
- **Agents:** `agents.list` -> `Agent[]`
- **Skills:** `skills.list` -> `Skill[]`

## 4. Error Handling
The client implements robust error handling for the WebSocket lifecycle:

- **Connection Errors:** `ws.onerror` captures network failures (e.g., Connection Refused, SSL Errors).
- **RPC Errors:** Handles `error` field in JSON-RPC responses (e.g., Auth failed, Invalid method).
- **Reconnection Logic:** Exponential backoff strategy (1s, 2s, 4s, 8s, max 5 attempts) on `ws.onclose`.

## 5. Rate Limiting
- **Client-Side:** No explicit rate limiting is currently implemented, but the UI prevents rapid-fire submissions.
- **Server-Side:** OpenClaw Gateway handles request queuing.

## 6. Testing Strategy
- **Unit Tests:** `src/lib/openclaw-client.test.ts` covers the client logic using mocked WebSockets.
- **Integration Test:** Run the app and use the **Connection Settings** modal to verify connectivity against a live server.
