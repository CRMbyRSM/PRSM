/**
 * Device identity for OpenClaw gateway authentication.
 * Generates Ed25519 keypair, derives deviceId from public key,
 * and signs connect payloads — matching the webchat's implementation.
 */

import * as ed from '@noble/ed25519'

const STORAGE_KEY = 'openclaw-device-identity-v1'

interface StoredIdentity {
  version: 1
  deviceId: string
  publicKey: string   // base64url
  privateKey: string  // base64url
  createdAtMs: number
}

export interface DeviceIdentity {
  deviceId: string
  publicKey: string   // base64url
  privateKey: string  // base64url
}

// ── Base64url helpers (matching webchat) ─────────────────────────

function toBase64url(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/g, '')
}

function fromBase64url(str: string): Uint8Array {
  const b64 = str.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - str.length % 4) % 4)
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ── Device ID = SHA-256 hex of public key ────────────────────────

async function deriveDeviceId(publicKey: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', publicKey.slice().buffer)
  return toHex(new Uint8Array(hash))
}

// ── Generate new keypair ─────────────────────────────────────────

async function generateIdentity(): Promise<DeviceIdentity> {
  const privateKeyBytes = ed.utils.randomPrivateKey()
  const publicKeyBytes = await ed.getPublicKeyAsync(privateKeyBytes)
  const deviceId = await deriveDeviceId(publicKeyBytes)
  return {
    deviceId,
    publicKey: toBase64url(publicKeyBytes),
    privateKey: toBase64url(privateKeyBytes)
  }
}

// ── Load or create identity (persisted in localStorage) ──────────

export async function getDeviceIdentity(): Promise<DeviceIdentity> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const data: StoredIdentity = JSON.parse(stored)
      if (data?.version === 1 && data.deviceId && data.publicKey && data.privateKey) {
        // Verify deviceId matches public key (same as webchat)
        const derivedId = await deriveDeviceId(fromBase64url(data.publicKey))
        if (derivedId !== data.deviceId) {
          // Fix mismatch
          const fixed = { ...data, deviceId: derivedId }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fixed))
          return { deviceId: derivedId, publicKey: data.publicKey, privateKey: data.privateKey }
        }
        return { deviceId: data.deviceId, publicKey: data.publicKey, privateKey: data.privateKey }
      }
    }
  } catch { /* regenerate */ }

  const identity = await generateIdentity()
  const toStore: StoredIdentity = {
    version: 1,
    ...identity,
    createdAtMs: Date.now()
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore))
  return identity
}

// ── Sign connect payload (matching gateway's buildDeviceAuthPayload) ──

function buildDeviceAuthPayload(params: {
  deviceId: string
  clientId: string
  clientMode: string
  role: string
  scopes: string[]
  signedAtMs: number
  token: string | null
  nonce?: string
}): string {
  // Gateway format: version|deviceId|clientId|clientMode|role|scopes|signedAtMs|token[|nonce]
  const version = params.nonce ? 'v2' : 'v1'
  const scopes = params.scopes.join(',')
  const token = params.token ?? ''
  const base = [
    version,
    params.deviceId,
    params.clientId,
    params.clientMode,
    params.role,
    scopes,
    String(params.signedAtMs),
    token
  ]
  if (version === 'v2') base.push(params.nonce ?? '')
  return base.join('|')
}

export async function signConnectPayload(
  identity: DeviceIdentity,
  params: {
    clientId: string
    clientMode: string
    role: string
    scopes: string[]
    token: string | null
    nonce?: string
  }
): Promise<{ id: string; publicKey: string; signature: string; signedAt: number; nonce?: string }> {
  const signedAt = Date.now()
  const payload = buildDeviceAuthPayload({
    deviceId: identity.deviceId,
    clientId: params.clientId,
    clientMode: params.clientMode,
    role: params.role,
    scopes: params.scopes,
    signedAtMs: signedAt,
    token: params.token,
    nonce: params.nonce
  })
  
  const msgBytes = new TextEncoder().encode(payload)
  const privKeyBytes = fromBase64url(identity.privateKey)
  const signature = await ed.signAsync(msgBytes, privKeyBytes)
  
  return {
    id: identity.deviceId,
    publicKey: identity.publicKey,
    signature: toBase64url(signature),
    signedAt,
    nonce: params.nonce
  }
}
