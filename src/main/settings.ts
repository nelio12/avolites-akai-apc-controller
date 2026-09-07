import { app } from 'electron'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { AppSettings } from '../shared/ipc'

const DEFAULT_SETTINGS: AppSettings = {
  titanHost: '127.0.0.1',
  titanPort: 4430
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export async function loadSettings(): Promise<AppSettings> {
  try {
    const raw = await readFile(settingsPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<AppSettings>
    return {
      titanHost: typeof parsed.titanHost === 'string' ? parsed.titanHost : DEFAULT_SETTINGS.titanHost,
      titanPort:
        typeof parsed.titanPort === 'number' && Number.isFinite(parsed.titanPort)
          ? parsed.titanPort
          : DEFAULT_SETTINGS.titanPort
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  const file = settingsPath()
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(settings, null, 2), 'utf8')
}
