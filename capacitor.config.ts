import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.rsm.prsm',
  appName: 'PRSM',
  webDir: 'dist',
  server: {
    // Allow connections to any WebSocket server
    allowNavigation: ['*']
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#06080a',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP',
      splashImmersive: true
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#06080a'
    }
  },
  ios: {
    contentInset: 'automatic',
    scheme: 'PRSM',
    preferredContentMode: 'mobile'
  },
  android: {
    backgroundColor: '#06080a',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
}

export default config
