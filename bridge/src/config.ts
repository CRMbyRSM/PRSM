import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface BridgeConfig {
  port: number
  host: string
  bridgeToken: string
  gatewayUrl: string
  gatewayHttpUrl: string
  gatewayAuthMode: 'token' | 'password'
  gatewayCredential: string
  workspaceRoot: string
  bridgeVersion: string
  corsOrigin: string
}

function parsePort(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback
  const parsed = Number.parseInt(raw, 10)
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 65535) return fallback
  return parsed
}

function detectWorkspaceRoot(explicitPath?: string): string {
  const candidates = [
    explicitPath,
    process.env.OPENCLAW_WORKSPACE,
    resolve(process.cwd(), '..'),
    process.cwd(),
    join(process.env.HOME || '', '.openclaw', 'workspace')
  ].filter((value): value is string => Boolean(value))

  for (const candidate of candidates) {
    const absolute = resolve(candidate)
    if (!existsSync(absolute)) continue

    const hasWorkspaceMarkers =
      existsSync(join(absolute, 'AGENTS.md')) ||
      existsSync(join(absolute, 'SOUL.md')) ||
      existsSync(join(absolute, 'memory'))

    if (hasWorkspaceMarkers) return absolute
  }

  throw new Error('Workspace root not detected. Set PRSM_WORKSPACE_ROOT.')
}

function readBridgeVersion(): string {
  try {
    // dist path -> bridge/dist, package.json is two levels up
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const pkg = require('../../package.json') as { version?: string }
    return pkg.version || '0.0.0'
  } catch {
    return '0.0.0'
  }
}

export function loadConfig(): BridgeConfig {
  const bridgeToken = process.env.PRSM_BRIDGE_TOKEN || ''
  if (!bridgeToken) {
    throw new Error('PRSM_BRIDGE_TOKEN is required for bridge authentication.')
  }

  const gatewayCredential =
    process.env.PRSM_GATEWAY_TOKEN ||
    process.env.OPENCLAW_GATEWAY_TOKEN ||
    process.env.PRSM_GATEWAY_PASSWORD ||
    process.env.OPENCLAW_GATEWAY_PASSWORD ||
    ''

  const gatewayUrl = process.env.PRSM_GATEWAY_URL || 'ws://127.0.0.1:18789'
  const gatewayHttpUrl = process.env.PRSM_GATEWAY_HTTP_URL || gatewayUrl.replace(/^ws/i, 'http')

  return {
    port: parsePort(process.env.PRSM_BRIDGE_PORT, 8787),
    host: process.env.PRSM_BRIDGE_HOST || '0.0.0.0',
    bridgeToken,
    gatewayUrl,
    gatewayHttpUrl,
    gatewayAuthMode: process.env.PRSM_GATEWAY_AUTH_MODE === 'password' ? 'password' : 'token',
    gatewayCredential,
    workspaceRoot: detectWorkspaceRoot(process.env.PRSM_WORKSPACE_ROOT),
    bridgeVersion: readBridgeVersion(),
    corsOrigin: process.env.PRSM_BRIDGE_CORS_ORIGIN || '*'
  }
}
