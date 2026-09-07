import { dialog, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import type { MappingProfile } from '../shared/ipc'

const FILTERS = [{ name: 'Perfil Titan APC', extensions: ['json'] }]

function targetWindow(): BrowserWindow | undefined {
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
}

export async function saveProfileToDisk(profile: MappingProfile): Promise<{ canceled: boolean; filePath?: string }> {
  const window = targetWindow()
  const result = window
    ? await dialog.showSaveDialog(window, {
        title: 'Guardar perfil de mapeo',
        defaultPath: `${profile.name || 'titan-apc-profile'}.json`,
        filters: FILTERS
      })
    : await dialog.showSaveDialog({
        title: 'Guardar perfil de mapeo',
        defaultPath: `${profile.name || 'titan-apc-profile'}.json`,
        filters: FILTERS
      })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await writeFile(result.filePath, JSON.stringify(profile, null, 2), 'utf8')
  return { canceled: false, filePath: result.filePath }
}

export async function loadProfileFromDisk(): Promise<{ canceled: boolean; profile?: MappingProfile; filePath?: string }> {
  const window = targetWindow()
  const result = window
    ? await dialog.showOpenDialog(window, {
        title: 'Cargar perfil de mapeo',
        properties: ['openFile'],
        filters: FILTERS
      })
    : await dialog.showOpenDialog({
        title: 'Cargar perfil de mapeo',
        properties: ['openFile'],
        filters: FILTERS
      })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]
  const raw = await readFile(filePath, 'utf8')
  const parsed = JSON.parse(raw) as MappingProfile

  if ((parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.mappings)) {
    throw new Error('El archivo no es un perfil de mapeo válido.')
  }

  return { canceled: false, profile: parsed, filePath }
}
