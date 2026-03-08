# PRSM Bridge v1

Thin HTTP bridge that sits beside OpenClaw on the same host.

- Keeps Gateway local/private
- Exposes a small PRSM-friendly API
- Guards workspace file access to workspace root
- Protects bridge endpoints with bearer-token auth

## Endpoints

- `GET /health` (no auth)
- `GET /runtime`
- `GET /sessions`
- `GET /sessions/:key/messages`
- `POST /messages/send`
- `GET /workspace/file?path=...`
- `POST /workspace/file`

## Environment

Required:

- `PRSM_BRIDGE_TOKEN` — bearer token required by bridge endpoints

Optional (with defaults):

- `PRSM_BRIDGE_HOST=0.0.0.0`
- `PRSM_BRIDGE_PORT=8787`
- `PRSM_GATEWAY_URL=ws://127.0.0.1:18789`
- `PRSM_GATEWAY_AUTH_MODE=token` (`password` also supported)
- `PRSM_GATEWAY_TOKEN=` (or `OPENCLAW_GATEWAY_TOKEN`)
- `PRSM_WORKSPACE_ROOT=` (auto-detected if omitted)
- `PRSM_BRIDGE_CORS_ORIGIN=*`

## Run

```bash
cd /home/riktanius/.openclaw/workspace/PRSM
npm run bridge:build
PRSM_BRIDGE_TOKEN='change-me' npm run bridge:start
```

## Smoke test

```bash
export BRIDGE_URL='http://127.0.0.1:8787'
export BRIDGE_TOKEN='change-me'

curl -s "$BRIDGE_URL/health"

curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" "$BRIDGE_URL/runtime"

curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" "$BRIDGE_URL/sessions"

curl -s -H "Authorization: Bearer $BRIDGE_TOKEN" \
  "$BRIDGE_URL/workspace/file?path=ACTIVE-WORK.md"

curl -s -X POST -H "Authorization: Bearer $BRIDGE_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"path":"tmp/prsm-bridge-test.txt","content":"hello from bridge"}' \
  "$BRIDGE_URL/workspace/file"
```

## Notes

- Streaming passthrough is intentionally not included in v1.
- Bridge talks to local Gateway only (no Gateway exposure required).
