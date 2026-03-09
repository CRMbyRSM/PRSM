import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

export interface ResolvedWorkspacePath {
  absolutePath: string
  relativePath: string
}

export function resolveWorkspacePath(workspaceRoot: string, inputPath: string): ResolvedWorkspacePath {
  if (typeof inputPath !== 'string' || !inputPath.trim()) {
    throw new Error('Invalid workspace path')
  }

  const normalizedInput = inputPath.trim().replace(/\\/g, '/')
  const absolutePath = isAbsolute(normalizedInput)
    ? resolve(normalizedInput)
    : resolve(workspaceRoot, normalizedInput.replace(/^\/+/, ''))

  const relativePath = relative(workspaceRoot, absolutePath)
  if (relativePath.startsWith('..') || isAbsolute(relativePath)) {
    throw new Error('Path is outside workspace root')
  }

  return {
    absolutePath,
    relativePath: relativePath.replace(/\\/g, '/')
  }
}

export async function readWorkspaceFile(workspaceRoot: string, inputPath: string): Promise<{ path: string; content: string; missing: boolean }> {
  const { absolutePath, relativePath } = resolveWorkspacePath(workspaceRoot, inputPath)

  try {
    const content = await fs.readFile(absolutePath, 'utf-8')
    return { path: relativePath, content, missing: false }
  } catch (error) {
    const maybeErr = error as NodeJS.ErrnoException
    if (maybeErr?.code === 'ENOENT') {
      return { path: relativePath, content: '', missing: true }
    }
    throw error
  }
}

export async function writeWorkspaceFile(workspaceRoot: string, inputPath: string, content: string): Promise<{ path: string }> {
  if (typeof content !== 'string') {
    throw new Error('Workspace file content must be a string')
  }

  const { absolutePath, relativePath } = resolveWorkspacePath(workspaceRoot, inputPath)
  await fs.mkdir(dirname(absolutePath), { recursive: true })
  await fs.writeFile(absolutePath, content, 'utf-8')
  return { path: relativePath }
}

export async function listWorkspaceFiles(workspaceRoot: string): Promise<Array<{ path: string; name: string; group: 'core' | 'projects' | 'skills'; description?: string }>> {
  const coreFiles = [
    'SOUL.md',
    'AGENTS.md',
    'MEMORY.md',
    'TOOLS.md',
    'USER.md',
    'IDENTITY.md',
    'HEARTBEAT.md',
    'ACTIVE-WORK.md',
    'WORKFLOW_AUTO.md'
  ]

  const results: Array<{ path: string; name: string; group: 'core' | 'projects' | 'skills'; description?: string }> = []

  // Core docs — only include if they exist
  for (const file of coreFiles) {
    try {
      await fs.access(resolve(workspaceRoot, file))
      results.push({ path: file, name: file, group: 'core' })
    } catch {
      // file doesn't exist, skip
    }
  }

  // Project files — memory/projects/*.md
  const scanDir = async (dir: string, group: 'projects' | 'skills', description?: string) => {
    try {
      const entries = await fs.readdir(resolve(workspaceRoot, dir), { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.md')) {
          results.push({ path: `${dir}/${entry.name}`, name: entry.name, group, description })
        }
      }
    } catch {
      // ignore missing dirs
    }
  }

  await scanDir('memory/projects', 'projects')

  // Skills — scan for SKILL.md files in skill directories
  // Check workspace skills/ directory first (local skills)
  try {
    const skillsDir = resolve(workspaceRoot, 'skills')
    const skillEntries = await fs.readdir(skillsDir, { withFileTypes: true })
    for (const entry of skillEntries) {
      if (entry.isDirectory()) {
        const skillMdPath = resolve(skillsDir, entry.name, 'SKILL.md')
        try {
          await fs.access(skillMdPath)
          results.push({
            path: `skills/${entry.name}/SKILL.md`,
            name: entry.name,
            group: 'skills',
            description: 'Local workspace skill'
          })
        } catch {
          // No SKILL.md in this dir, skip
        }
      }
    }
  } catch {
    // skills/ dir doesn't exist
  }

  // Also scan OpenClaw's installed skills directory
  const installedSkillsDir = resolve(process.env.HOME || '', '.npm-global/lib/node_modules/openclaw/skills')
  try {
    const installedEntries = await fs.readdir(installedSkillsDir, { withFileTypes: true })
    for (const entry of installedEntries) {
      if (entry.isDirectory()) {
        // Only add if not already in results (local skills take priority)
        const alreadyListed = results.some(r => r.group === 'skills' && r.name === entry.name)
        if (alreadyListed) continue
        const skillMdPath = resolve(installedSkillsDir, entry.name, 'SKILL.md')
        try {
          await fs.access(skillMdPath)
          results.push({
            path: `~/.npm-global/lib/node_modules/openclaw/skills/${entry.name}/SKILL.md`,
            name: entry.name,
            group: 'skills',
            description: 'Installed OpenClaw skill'
          })
        } catch {
          // No SKILL.md, skip
        }
      }
    }
  } catch {
    // installed skills dir doesn't exist
  }

  return results
}
