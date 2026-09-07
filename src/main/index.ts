import { app, BrowserWindow, ipcMain, session, shell } from 'electron'
import { join } from 'node:path'
import { loadSettings, saveSettings } from './settings'
import { proxyTitanRequest } from './titan-proxy'
import { loadProfileFromDisk, saveProfileToDisk } from './profiles'
import type { AppSettings, MappingProfile, TitanRequestPayload } from '../shared/ipc'

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    show: false,
    backgroundColor: '#090b10',
    title: 'Titan APC Mapper',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('settings:get', async () => loadSettings())

  ipcMain.handle('settings:set', async (_event, settings: AppSettings) => {
    await saveSettings(settings)
    return settings
  })

  ipcMain.handle('titan:request', async (_event, payload: TitanRequestPayload) => {
    return proxyTitanRequest(payload)
  })

  ipcMain.handle('profiles:save', async (_event, profile: MappingProfile) => {
    return saveProfileToDisk(profile)
  })

  ipcMain.handle('profiles:load', async () => {
    return loadProfileFromDisk()
  })
}

app.whenReady().then(() => {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.titanapc.mapper')
  }

  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(permission === 'midi' || permission === 'midiSysex')
  })

  registerIpc()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
