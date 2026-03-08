import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import { loadConfig } from './config'
import { readWorkspaceFile, writeWorkspaceFile } from './workspace'

type JsonRecord = Record<string, unknown>

interface SendOptions {
  status?: number
  corsOrigin: string
}

function sendJson(res: ServerResponse, body: JsonRecord, options: SendOptions): void {
  const status = options.status || 200
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload).toString(),
    'Access-Control-Allow-Origin': options.corsOrigin,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<JsonRecord> {
  const chunks: Buffer[] = []
  let size = 0

  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.length
    if (size > 1_000_000) {
      throw new Error('Request body too large (max 1MB)')
    }
    chunks.push(buffer)
  }

  if (chunks.length === 0) return {}

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8')) as JsonRecord
  } catch {
    throw new Error('Invalid JSON body')
  }
}

function getBearerToken(req: IncomingMessage): string | null {
  const header = req.headers.authorization
  if (!header || !header.startsWith('Bearer ')) return null
  return header.slice('Bearer '.length).trim()
}

function assertAuth(req: IncomingMessage, bridgeToken: string): void {
  const provided = getBearerToken(req)
  if (!provided || provided !== bridgeToken) {
    throw new Error('Unauthorized: missing or invalid bearer token')
  }
}

async function start(): Promise<void> {
  const config = loadConfig()
  const startedAt = Date.now()

  const server = createServer(async (req, res) => {
    const requestId = randomUUID()

    try {
      if (!req.url || !req.method) {
        sendJson(res, { ok: false, error: 'Invalid request' }, { status: 400, corsOrigin: config.corsOrigin })
        return
      }

      if (req.method === 'OPTIONS') {
        sendJson(res, { ok: true }, { status: 204, corsOrigin: config.corsOrigin })
        return
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
      const pathname = url.pathname

      if (req.method === 'GET' && pathname === '/health') {
        sendJson(res, {
          ok: true,
          status: 'ok',
          requestId,
          uptimeSec: Math.floor((Date.now() - startedAt) / 1000),
          timestamp: new Date().toISOString()
        }, { corsOrigin: config.corsOrigin })
        return
      }

      assertAuth(req, config.bridgeToken)

      // Request logging
      console.log(`[prsm-bridge] ${req.method} ${pathname}`)

      if (req.method === 'GET' && pathname === '/runtime') {
        sendJson(res, {
          ok: true,
          requestId,
          runtime: {
            bridgeVersion: config.bridgeVersion,
            gatewayUrl: config.gatewayUrl,
            gatewayHttpUrl: config.gatewayHttpUrl,
            workspaceRoot: config.workspaceRoot,
            startedAt: new Date(startedAt).toISOString()
          }
        }, { corsOrigin: config.corsOrigin })
        return
      }

      if (req.method === 'GET' && pathname === '/sessions') {
        const limitRaw = url.searchParams.get('limit')
        const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 50

        const { execFile } = await import('node:child_process')
        const gatewayResult = await new Promise<string>((resolve, reject) => {
          execFile(
            'openclaw',
            ['gateway', 'call', 'sessions.list', '--params', JSON.stringify({ limit: Number.isFinite(limit) ? limit : 50, includeDerivedTitles: true, includeLastMessage: true }), '--json'],
            { cwd: '/home/riktanius/.openclaw/workspace', env: process.env, timeout: 30000 },
            (error, stdout, stderr) => {
              if (error) {
                reject(new Error((stderr || stdout || error.message).trim()))
                return
              }
              resolve(stdout)
            }
          )
        })

        let parsedResult: unknown = gatewayResult
        try {
          parsedResult = JSON.parse(gatewayResult)
        } catch {
          parsedResult = gatewayResult.trim()
        }

        const sessions = Array.isArray(parsedResult)
          ? parsedResult
          : (parsedResult as { sessions?: unknown[] } | null)?.sessions || parsedResult

        sendJson(res, { ok: true, requestId, sessions }, { corsOrigin: config.corsOrigin })
        return
      }

      const sessionMessagesMatch = pathname.match(/^\/sessions\/([^/]+)\/messages$/)
      if (req.method === 'GET' && sessionMessagesMatch) {
        const sessionKey = decodeURIComponent(sessionMessagesMatch[1])

        const { execFile } = await import('node:child_process')
        const gatewayResult = await new Promise<string>((resolve, reject) => {
          execFile(
            'openclaw',
            ['gateway', 'call', 'chat.history', '--params', JSON.stringify({ sessionKey }), '--json'],
            { cwd: '/home/riktanius/.openclaw/workspace', env: process.env, timeout: 30000 },
            (error, stdout, stderr) => {
              if (error) {
                reject(new Error((stderr || stdout || error.message).trim()))
                return
              }
              resolve(stdout)
            }
          )
        })

        let parsedResult: unknown = gatewayResult
        try {
          parsedResult = JSON.parse(gatewayResult)
        } catch {
          parsedResult = gatewayResult.trim()
        }

        // Gateway chat.history returns { sessionKey, sessionId, messages: [...], thinkingLevel }
        // Unwrap so the client gets { ok, requestId, sessionKey, messages: [...] }
        const historyData = parsedResult as Record<string, unknown> | null
        const messagesArray = historyData?.messages ?? parsedResult
        sendJson(res, { ok: true, requestId, sessionKey, messages: messagesArray }, { corsOrigin: config.corsOrigin })
        return
      }

      if (req.method === 'POST' && pathname === '/messages/send') {
        const body = await readJsonBody(req)
        const content = typeof body.message === 'string'
          ? body.message
          : typeof body.content === 'string'
            ? body.content
            : ''

        if (!content.trim()) {
          sendJson(res, { ok: false, error: 'message (or content) is required' }, { status: 400, corsOrigin: config.corsOrigin })
          return
        }

        const agentId = typeof body.agentId === 'string' ? body.agentId : undefined
        const sessionKey = typeof body.sessionKey === 'string'
          ? body.sessionKey
          : (agentId ? `agent:${agentId}:main` : 'agent:main:main')

        const params: JsonRecord = {
          sessionKey,
          message: content,
          deliver: true,
          idempotencyKey: typeof body.idempotencyKey === 'string' ? body.idempotencyKey : randomUUID()
        }

        if (Array.isArray(body.attachments)) {
          params.attachments = body.attachments
        }


        const { execFile } = await import('node:child_process')
        const gatewayResult = await new Promise<string>((resolve, reject) => {
          execFile(
            'openclaw',
            ['gateway', 'call', 'chat.send', '--params', JSON.stringify(params), '--json'],
            { cwd: '/home/riktanius/.openclaw/workspace', env: process.env, timeout: 30000 },
            (error, stdout, stderr) => {
              if (error) {
                reject(new Error((stderr || stdout || error.message).trim()))
                return
              }
              resolve(stdout)
            }
          )
        })

        let parsedResult: unknown = gatewayResult
        try {
          parsedResult = JSON.parse(gatewayResult)
        } catch {
          parsedResult = gatewayResult.trim()
        }

        sendJson(res, { ok: true, requestId, result: parsedResult }, { corsOrigin: config.corsOrigin })
        return
      }

      if (req.method === 'GET' && pathname === '/workspace/file') {
        const targetPath = url.searchParams.get('path') || ''
        if (!targetPath) {
          sendJson(res, { ok: false, error: 'query parameter "path" is required' }, { status: 400, corsOrigin: config.corsOrigin })
          return
        }

        const file = await readWorkspaceFile(config.workspaceRoot, targetPath)
        sendJson(res, { ok: true, requestId, ...file }, { corsOrigin: config.corsOrigin })
        return
      }

      if (req.method === 'POST' && pathname === '/workspace/file') {
        const body = await readJsonBody(req)
        const targetPath = typeof body.path === 'string' ? body.path : ''
        const content = typeof body.content === 'string' ? body.content : null

        if (!targetPath) {
          sendJson(res, { ok: false, error: 'path is required' }, { status: 400, corsOrigin: config.corsOrigin })
          return
        }
        if (content === null) {
          sendJson(res, { ok: false, error: 'content must be a string' }, { status: 400, corsOrigin: config.corsOrigin })
          return
        }

        const result = await writeWorkspaceFile(config.workspaceRoot, targetPath, content)
        sendJson(res, { ok: true, requestId, ...result }, { corsOrigin: config.corsOrigin })
        return
      }

      sendJson(res, { ok: false, error: 'Route not found' }, { status: 404, corsOrigin: config.corsOrigin })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      const status = message.toLowerCase().includes('unauthorized') ? 401 : 500
      sendJson(res, { ok: false, requestId, error: message }, { status, corsOrigin: config.corsOrigin })
    }
  })

  server.listen(config.port, config.host, () => {
    // eslint-disable-next-line no-console
    console.log(`[prsm-bridge] listening on http://${config.host}:${config.port}`)
    // eslint-disable-next-line no-console
    console.log(`[prsm-bridge] gateway ws: ${config.gatewayUrl}`)
    console.log(`[prsm-bridge] gateway http: ${config.gatewayHttpUrl}`)
    // eslint-disable-next-line no-console
    console.log(`[prsm-bridge] workspace: ${config.workspaceRoot}`)
  })
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[prsm-bridge] fatal startup error:', error)
  process.exit(1)
})
