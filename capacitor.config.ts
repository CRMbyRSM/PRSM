import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.clawcontrol.app',
  appName: 'ClawControl',
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
    scheme: 'ClawControl',
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
