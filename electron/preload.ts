import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  connect: (url: string) => ipcRenderer.invoke('openclaw:connect', url),
  getConfig: () => ipcRenderer.invoke('openclaw:getConfig'),
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  trustHost: (hostname: string) => ipcRenderer.invoke('cert:trustHost', hostname),
  saveToken: (token: string) => ipcRenderer.invoke('auth:saveToken', token),
  getToken: () => ipcRenderer.invoke('auth:getToken'),
  isEncryptionAvailable: () => ipcRenderer.invoke('auth:isEncryptionAvailable'),
  showNotification: (title: string, body: string) => ipcRenderer.invoke('notification:show', title, body),
  updateCheck: () => ipcRenderer.invoke('update:checkNow'),
  updateDownload: () => ipcRenderer.invoke('update:downloadUpdate'),
  updateInstall: () => ipcRenderer.invoke('update:installUpdate'),
  onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => {
    ipcRenderer.on('update:available', (_e, info) => cb(info))
  },
  onUpdateDownloaded: (cb: () => void) => {
    ipcRenderer.on('update:downloaded', () => cb())
  },
  onUpdateError: (cb: (err: string) => void) => {
    ipcRenderer.on('update:error', (_e, err) => cb(err))
  },
  updateSyncPolicy: (policy: string, lastCheck: number) => ipcRenderer.invoke('update:syncPolicy', policy, lastCheck),
  getRuntimeInfo: () => ipcRenderer.invoke('runtime:getInfo'),
  readWorkspaceFile: (path: string) => ipcRenderer.invoke('workspace:readFile', path),
  writeWorkspaceFile: (path: string, content: string) => ipcRenderer.invoke('workspace:writeFile', path, content),
  openSubagentPopout: (params: { sessionKey: string; serverUrl: string; authToken: string; authMode: string; label: string }) =>
    ipcRenderer.invoke('subagent:openPopout', params),
  openToolCallPopout: (params: { toolCallId: string; name: string }) =>
    ipcRenderer.invoke('toolcall:openPopout', params),
  invoke: (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args),
  platform: process.platform
})

// Type definitions for the exposed API
declare global {
  interface Window {
    electronAPI: {
      connect: (url: string) => Promise<{ success: boolean; url: string }>
      getConfig: () => Promise<{ defaultUrl: string; theme: string }>
      openExternal: (url: string) => Promise<void>
      trustHost: (hostname: string) => Promise<{ trusted: boolean; hostname: string }>
      saveToken: (token: string) => Promise<{ saved: boolean }>
      getToken: () => Promise<string>
      isEncryptionAvailable: () => Promise<boolean>
      showNotification: (title: string, body: string) => Promise<void>
      updateCheck: () => Promise<void>
      updateDownload: () => Promise<void>
      updateInstall: () => Promise<void>
      onUpdateAvailable: (cb: (info: { version: string; releaseNotes: string }) => void) => void
      onUpdateDownloaded: (cb: () => void) => void
      onUpdateError: (cb: (err: string) => void) => void
      updateSyncPolicy: (policy: string, lastCheck: number) => Promise<void>
      getRuntimeInfo: () => Promise<{ mode: 'desktop'; platform: string; bridgeAvailable: boolean; appVersion: string; workspaceRoot: string | null }>
      readWorkspaceFile: (path: string) => Promise<{ ok: boolean; path: string; content: string; missing: boolean }>
      writeWorkspaceFile: (path: string, content: string) => Promise<{ ok: boolean; path: string }>
      openSubagentPopout: (params: { sessionKey: string; serverUrl: string; authToken: string; authMode: string; label: string }) => Promise<void>
      openToolCallPopout: (params: { toolCallId: string; name: string }) => Promise<void>
      invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
      platform: NodeJS.Platform
    }
  }
}
