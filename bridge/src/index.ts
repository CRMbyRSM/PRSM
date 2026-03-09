import { createServer, IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { URL } from 'node:url'
import { loadConfig } from './config'
import { listWorkspaceFiles, readWorkspaceFile, writeWorkspaceFile } from './workspace'

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

      // --- Generic Gateway Proxy (Agents, Skills, Crons, Config) ---
      const proxyMap: Record<string, string> = {
        '/agents': 'agents.list',
        '/skills': 'skills.list',
        '/cron-jobs': 'cron.list',
        '/config': 'config.get'
      }

      if (req.method === 'GET' && proxyMap[pathname]) {
        const method = proxyMap[pathname]
        const { execFile } = await import('node:child_process')
        const gatewayResult = await new Promise<string>((resolve, reject) => {
          execFile(
            'openclaw',
            ['gateway', 'call', method, '--json'],
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

        try {
          let parsed = JSON.parse(gatewayResult)

          if (pathname === '/agents') {
            const rawAgents = Array.isArray((parsed as any)?.agents) ? (parsed as any).agents : []
            parsed = rawAgents.map((a: any) => ({
              id: a.id,
              name: a.name || a.id,
              description: a.description || '',
              status: 'online',
              emoji: a.emoji,
              model: a.model,
              configured: true
            }))
          }

          if (pathname === '/cron-jobs') {
            const rawJobs = Array.isArray((parsed as any)?.jobs) ? (parsed as any).jobs : []
            parsed = rawJobs.map((j: any) => ({
              id: j.id,
              name: j.name || j.id,
              schedule: j.schedule?.expr || j.schedule?.kind || 'unknown',
              nextRun: j.nextRunAt
                ? new Date(j.nextRunAt).toISOString()
                : computeNextCronRun(j.schedule?.expr, j.schedule?.tz),
              status: j.enabled ? 'active' : 'paused',
              description: j.payload?.message || '',
              lastRunAt: j.lastRunAt ? new Date(j.lastRunAt).toISOString() : undefined
            }))
          }

          sendJson(res, { ok: true, requestId, result: parsed }, { corsOrigin: config.corsOrigin })
        } catch {
          sendJson(res, { ok: false, error: 'Failed to parse gateway response' }, { status: 500, corsOrigin: config.corsOrigin })
        }
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

      if (req.method === 'GET' && pathname === '/workspace/files') {
        const files = await listWorkspaceFiles(config.workspaceRoot)
        sendJson(res, { ok: true, requestId, files }, { corsOrigin: config.corsOrigin })
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

/**
 * Compute the next run time for a simple cron expression.
 * Supports standard 5-field cron (min hour dom month dow).
 * Returns ISO string or undefined if unparseable.
 */
function computeNextCronRun(expr?: string, tz?: string): string | undefined {
  if (!expr || typeof expr !== 'string') return undefined

  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return undefined

  const [minPart, hourPart, domPart, monPart, dowPart] = parts

  function parseField(field: string, min: number, max: number): number[] | null {
    if (field === '*') return null // means "all"
    const values: number[] = []
    for (const segment of field.split(',')) {
      const stepMatch = segment.match(/^(\*|\d+-\d+)\/(\d+)$/)
      if (stepMatch) {
        const step = parseInt(stepMatch[2], 10)
        let rangeStart = min
        let rangeEnd = max
        if (stepMatch[1] !== '*') {
          const [rs, re] = stepMatch[1].split('-').map(Number)
          rangeStart = rs
          rangeEnd = re
        }
        for (let i = rangeStart; i <= rangeEnd; i += step) values.push(i)
        continue
      }
      const rangeMatch = segment.match(/^(\d+)-(\d+)$/)
      if (rangeMatch) {
        const start = parseInt(rangeMatch[1], 10)
        const end = parseInt(rangeMatch[2], 10)
        for (let i = start; i <= end; i++) values.push(i)
        continue
      }
      const num = parseInt(segment, 10)
      if (!isNaN(num) && num >= min && num <= max) values.push(num)
    }
    return values.length > 0 ? values : null
  }

  try {
    const minutes = parseField(minPart, 0, 59)
    const hours = parseField(hourPart, 0, 23)
    const doms = parseField(domPart, 1, 31)
    const months = parseField(monPart, 1, 12)
    const dows = parseField(dowPart, 0, 6)

    // Start from now, scan forward up to 7 days
    const now = new Date()
    const maxLookahead = 7 * 24 * 60 // 7 days in minutes

    for (let offset = 1; offset <= maxLookahead; offset++) {
      const candidate = new Date(now.getTime() + offset * 60000)
      // Zero out seconds/ms
      candidate.setSeconds(0, 0)

      const min = candidate.getMinutes()
      const hour = candidate.getHours()
      const dom = candidate.getDate()
      const mon = candidate.getMonth() + 1
      const dow = candidate.getDay()

      if (minutes && !minutes.includes(min)) continue
      if (hours && !hours.includes(hour)) continue
      if (doms && !doms.includes(dom)) continue
      if (months && !months.includes(mon)) continue
      if (dows && !dows.includes(dow)) continue

      return candidate.toISOString()
    }
  } catch {
    // Parse error — return undefined
  }

  return undefined
}

start().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('[prsm-bridge] fatal startup error:', error)
  process.exit(1)
})
