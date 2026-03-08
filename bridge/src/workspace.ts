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
