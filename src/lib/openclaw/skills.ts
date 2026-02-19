// OpenClaw Client - Skills API Methods

import type { Skill, RpcCaller } from './types'

export async function listSkills(call: RpcCaller): Promise<Skill[]> {
  try {
    const result = await call<any>('skills.status')
    const skills = Array.isArray(result) ? result : (result?.skills || result?.items || result?.list || [])
    return skills.map((s: any) => ({
      id: String(s.skillKey || s.id || s.name || `skill-${Math.random()}`),
      name: String(s.name || 'Unnamed Skill'),
      description: String(s.description || ''),
      triggers: Array.isArray(s.triggers) ? s.triggers.map(String) : [],
      enabled: !s.disabled,
      emoji: s.emoji,
      homepage: s.homepage,
      source: s.source,
      bundled: s.bundled,
      filePath: s.filePath,
      eligible: s.eligible,
      always: s.always,
      requirements: s.requirements,
      missing: s.missing,
      install: s.install
    }))
  } catch {
    return []
  }
}

export async function toggleSkill(call: RpcCaller, skillKey: string, enabled: boolean): Promise<void> {
  await call('skills.update', { skillKey, enabled })
}

export async function installSkill(call: RpcCaller, skillName: string, installId: string): Promise<void> {
  await call('skills.install', { name: skillName, installId, timeoutMs: 60000 })
}

export async function installHubSkill(call: RpcCaller, slug: string, sessionKey?: string): Promise<void> {
  // Validate slug to prevent command injection (slugs are kebab-case alphanumeric)
  if (!/^[a-zA-Z0-9_-]+$/.test(slug)) {
    throw new Error(`Invalid skill slug: ${slug}`)
  }

  // Send a chat message asking the agent to install the skill via exec tool.
  // The agent has exec tool access and can run clawhub install directly.
  const payload: Record<string, unknown> = {
    message: `Run this command: clawhub install ${slug} --force`,
    sessionKey: sessionKey || 'agent:main:main',
    idempotencyKey: `clawhub-install-${slug}-${Date.now()}`
  }

  await call('chat.send', payload, { timeoutMs: 150000 })
}
