/// <reference types="vite/client" />

declare const __APP_VERSION__: string

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
    platform: NodeJS.Platform
  }
}
