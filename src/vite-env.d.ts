/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    connect: (url: string) => Promise<{ success: boolean; url: string }>
    getConfig: () => Promise<{ defaultUrl: string; theme: string }>
    openExternal: (url: string) => Promise<void>
    trustHost: (hostname: string) => Promise<{ trusted: boolean; hostname: string }>
    saveToken: (token: string) => Promise<{ saved: boolean }>
    getToken: () => Promise<string>
    isEncryptionAvailable: () => Promise<boolean>
    platform: NodeJS.Platform
  }
}
