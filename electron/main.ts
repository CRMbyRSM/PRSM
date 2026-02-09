import { app, BrowserWindow, ipcMain, shell, Menu, safeStorage, Notification } from 'electron'
import { join, dirname } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'

// Read version from package.json (works in both dev and prod)
function getAppVersion(): string {
  try {
    const pkgPath = app.isPackaged
      ? join(dirname(app.getAppPath()), 'package.json')
      : join(__dirname, '..', 'package.json')
    const pkg = JSON.parse(readFileSync(existsSync(pkgPath) ? pkgPath : join(app.getAppPath(), 'package.json'), 'utf-8'))
    return pkg.version || app.getVersion()
  } catch {
    return app.getVersion()
  }
}

let mainWindow: BrowserWindow | null = null
const trustedHosts = new Set<string>()

// Path to persist trusted hosts
function getTrustedHostsPath(): string {
  const userDataPath = app.getPath('userData')
  return join(userDataPath, 'trusted-hosts.json')
}

// Load trusted hosts from disk
function loadTrustedHosts(): void {
  try {
    const filePath = getTrustedHostsPath()
    if (existsSync(filePath)) {
      const data = readFileSync(filePath, 'utf-8')
      const hosts: string[] = JSON.parse(data)
      hosts.forEach(host => trustedHosts.add(host))
    }
  } catch {
    // Ignore errors loading trusted hosts
  }
}

// Save trusted hosts to disk
function saveTrustedHosts(): void {
  try {
    const filePath = getTrustedHostsPath()
    const dir = join(filePath, '..')
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const hosts = Array.from(trustedHosts)
    writeFileSync(filePath, JSON.stringify(hosts, null, 2))
  } catch {
    // Ignore errors saving trusted hosts
  }
}

function createWindow() {
  // Remove the default menu bar (File, Edit, View, Window, Help)
  Menu.setApplicationMenu(null)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    icon: join(__dirname, '../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true
    },
    titleBarStyle: 'hiddenInset',
    frame: process.platform === 'darwin' ? true : true,
    backgroundColor: '#0d1117'
  })

  // Allow DevTools shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      mainWindow?.webContents.toggleDevTools()
    }
  })

  // Enable context menu for copy/paste
  mainWindow.webContents.on('context-menu', (_event, params) => {
    const menu = Menu.buildFromTemplate([
      { role: 'cut', enabled: params.editFlags.canCut },
      { role: 'copy', enabled: params.editFlags.canCopy },
      { role: 'paste', enabled: params.editFlags.canPaste },
      { role: 'selectAll', enabled: params.editFlags.canSelectAll }
    ])
    menu.popup()
  })

  // Set window title (version shown in sidebar instead)
  mainWindow.setTitle('ClawControlRSM')

  // Load the app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch { /* ignore */ }
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    // Allow dev server reloads
    if (process.env.VITE_DEV_SERVER_URL && url.startsWith(process.env.VITE_DEV_SERVER_URL)) return
    // Allow loading the app itself
    if (url.startsWith('file://')) return
    // Everything else opens in system browser
    event.preventDefault()
    try {
      const parsed = new URL(url)
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url)
      }
    } catch { /* ignore */ }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}


// Handle certificate errors - trust hosts that user has explicitly accepted
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  try {
    const parsedUrl = new URL(url)
    if (trustedHosts.has(parsedUrl.hostname)) {
      event.preventDefault()
      callback(true)
      return
    }
  } catch {
    // Ignore URL parsing errors
  }
  callback(false)
})

app.whenReady().then(() => {
  loadTrustedHosts()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Notification handler
ipcMain.handle('notification:show', (_event, title: string, body: string) => {
  new Notification({ title, body }).show()
})

// IPC handlers for OpenClaw communication
ipcMain.handle('openclaw:connect', async (_event, url: string) => {
  // Connection will be handled in renderer process via WebSocket
  return { success: true, url }
})

ipcMain.handle('openclaw:getConfig', async () => {
  return {
    defaultUrl: '',
    theme: 'dark'
  }
})

ipcMain.handle('shell:openExternal', async (_event, url: string) => {
  // Validate URL to only allow http/https protocols
  try {
    const parsedUrl = new URL(url)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error('Invalid protocol')
    }
    await shell.openExternal(url)
  } catch {
    throw new Error('Invalid URL')
  }
})

// --- Secure token storage ---

function getTokenPath(): string {
  return join(app.getPath('userData'), 'auth-token.enc')
}

function saveToken(token: string): void {
  const filePath = getTokenPath()
  if (!token) {
    // Delete the file when token is cleared
    try { unlinkSync(filePath) } catch { /* file may not exist */ }
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token)
    writeFileSync(filePath, encrypted)
  } else {
    // Fallback: base64 (better than plaintext in localStorage)
    writeFileSync(filePath, Buffer.from(token, 'utf-8').toString('base64'), 'utf-8')
  }
}

function loadToken(): string {
  const filePath = getTokenPath()
  if (!existsSync(filePath)) return ''
  try {
    const raw = readFileSync(filePath)
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(raw)
    }
    // Fallback: base64
    return Buffer.from(raw.toString('utf-8'), 'base64').toString('utf-8')
  } catch {
    return ''
  }
}

ipcMain.handle('auth:saveToken', async (_event, token: string) => {
  if (typeof token !== 'string') throw new Error('Invalid token')
  saveToken(token)
  return { saved: true }
})

ipcMain.handle('auth:getToken', async () => {
  return loadToken()
})

ipcMain.handle('auth:isEncryptionAvailable', async () => {
  return safeStorage.isEncryptionAvailable()
})

// Trust a hostname for certificate errors (persisted across app restarts)
ipcMain.handle('cert:trustHost', async (_event, hostname: string) => {
  // Validate hostname format
  if (!hostname || typeof hostname !== 'string' || hostname.length > 253) {
    throw new Error('Invalid hostname')
  }
  // Basic hostname validation (alphanumeric, dots, hyphens)
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/
  if (!hostnameRegex.test(hostname)) {
    throw new Error('Invalid hostname format')
  }
  trustedHosts.add(hostname)
  saveTrustedHosts()
  return { trusted: true, hostname }
})
