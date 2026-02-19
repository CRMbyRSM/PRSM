// OpenClaw Client - Server Config API Methods

import type { RpcCaller } from './types'

/**
 * Reads the full server config via config.get.
 * Returns the raw config object and the hash needed for config.patch.
 */
export async function getServerConfig(call: RpcCaller): Promise<{ config: any; hash: string }> {
  const result = await call<any>('config.get', {})
  const config = result?.config ?? null
  const hash = result?.hash ?? ''
  return { config, hash }
}

/**
 * Patches the server config via config.patch.
 * Uses baseHash for optimistic conflict detection.
 * Note: config.patch triggers a server restart via SIGUSR1.
 */
export async function patchServerConfig(call: RpcCaller, patch: object, baseHash: string): Promise<void> {
  await call<any>('config.patch', { raw: JSON.stringify(patch), baseHash })
}
