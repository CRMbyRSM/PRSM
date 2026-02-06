/// <reference types="vite/client" />

interface Window {
  electronAPI: {
    connect: (url: string) => Promise<{ success: boolean; url: string }>
    getConfig: () => Promise<{ defaultUrl: string; theme: string }>
    platform: NodeJS.Platform
  }
}
