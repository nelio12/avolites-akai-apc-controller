import { networkInterfaces } from 'node:os'
import net from 'node:net'
import type { DiscoveredTitan } from '../shared/ipc'

const API_PORT = 4430
const TCP_TIMEOUT_MS = 350
const HTTP_TIMEOUT_MS = 1200
const CONCURRENCY = 24

export async function discoverTitanConsoles(preferredHost?: string): Promise<DiscoveredTitan[]> {
  const hosts = collectCandidateHosts(preferredHost)
  const found = await mapPool(hosts, CONCURRENCY, probeHost)
  return found.sort((left, right) => compareHosts(left.host, right.host))
}

function collectCandidateHosts(preferredHost?: string): string[] {
  const skip = new Set<string>()
  const subnetHosts: string[] = []
  const priority: string[] = []

  if (preferredHost && looksLikeIpv4(preferredHost)) {
    priority.push(preferredHost.trim())
  }
  priority.push('127.0.0.1')

  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs ?? []) {
      if (!isIpv4(addr) || addr.internal || isLinkLocal(addr.address)) {
        continue
      }
      skip.add(addr.address)
      const octets = addr.address.split('.').map(Number)
      const prefix = `${octets[0]}.${octets[1]}.${octets[2]}`
      priority.push(`${prefix}.40`)
      for (let host = 1; host <= 254; host++) {
        const candidate = `${prefix}.${host}`
        if (!skip.has(candidate)) {
          subnetHosts.push(candidate)
        }
      }
    }
  }

  const unique = new Set<string>()
  const ordered: string[] = []
  for (const host of [...priority, ...subnetHosts]) {
    if (unique.has(host) || skip.has(host)) {
      continue
    }
    unique.add(host)
    ordered.push(host)
  }
  return ordered
}

function isIpv4(addr: { family: string | number; address: string; internal: boolean }): boolean {
  return addr.family === 'IPv4' || addr.family === 4
}

function isLinkLocal(address: string): boolean {
  return address.startsWith('169.254.')
}

function looksLikeIpv4(value: string): boolean {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(value.trim())
}

async function probeHost(host: string): Promise<DiscoveredTitan | null> {
  const open = await tcpOpen(host, API_PORT, TCP_TIMEOUT_MS)
  if (!open) {
    return null
  }

  const showName = await fetchTitanText(host, '/titan/get/Show/ShowName')
  if (showName == null) {
    return null
  }

  const device = await fetchTitanJson(host, '/titan/get/Titan/DeviceInfo')

  return {
    host,
    port: API_PORT,
    showName: showName || (typeof device?.ShowName === 'string' ? device.ShowName : 'Sin show'),
    version: null,
    computerName: readDeviceName(device),
    hardware: readHardware(device)
  }
}

function readDeviceName(device: Record<string, unknown> | null): string | null {
  if (!device) {
    return null
  }
  const clients = device.Clients
  if (Array.isArray(clients) && clients[0] && typeof clients[0] === 'object') {
    const client = clients[0] as Record<string, unknown>
    if (typeof client.ComputerName === 'string' && client.ComputerName.trim()) {
      return client.ComputerName.trim()
    }
    if (typeof client.Legend === 'string' && client.Legend.trim()) {
      return client.Legend.trim()
    }
  }
  return null
}

function readHardware(device: Record<string, unknown> | null): string | null {
  if (!device) {
    return null
  }
  const clients = device.Clients
  if (Array.isArray(clients) && clients[0] && typeof clients[0] === 'object') {
    const client = clients[0] as Record<string, unknown>
    if (typeof client.HardwareIdentifier === 'string' && client.HardwareIdentifier.trim()) {
      return client.HardwareIdentifier.split(';')[0]?.trim() ?? null
    }
  }
  return null
}

function tcpOpen(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    let settled = false

    const finish = (ok: boolean): void => {
      if (settled) {
        return
      }
      settled = true
      clearTimeout(timer)
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }

    const timer = setTimeout(() => finish(false), timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })
}

async function fetchTitanText(host: string, path: string): Promise<string | null> {
  const raw = await fetchRaw(host, path)
  if (raw == null) {
    return null
  }
  const parsed = parseMaybeJson(raw)
  if (typeof parsed === 'string' || typeof parsed === 'number' || typeof parsed === 'boolean') {
    return String(parsed).replace(/^"|"$/g, '').trim()
  }
  if (parsed == null) {
    const trimmed = raw.trim().replace(/^"|"$/g, '')
    return trimmed || null
  }
  return null
}

async function fetchTitanJson(host: string, path: string): Promise<Record<string, unknown> | null> {
  const raw = await fetchRaw(host, path)
  if (raw == null) {
    return null
  }
  const parsed = parseMaybeJson(raw)
  if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
    return parsed as Record<string, unknown>
  }
  return null
}

async function fetchRaw(host: string, path: string): Promise<string | null> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS)
  try {
    const response = await fetch(`http://${host}:${API_PORT}${path}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, */*' }
    })
    if (!response.ok) {
      return null
    }
    const text = (await response.text()).trim()
    if (!text || text.startsWith('<')) {
      return null
    }
    return text
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

function parseMaybeJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function compareHosts(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 4; index++) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

async function mapPool<T, R>(items: T[], limit: number, mapper: (item: T) => Promise<R | null>): Promise<R[]> {
  const results: R[] = []
  let next = 0

  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const current = items[next]
      next += 1
      if (current === undefined) {
        continue
      }
      const mapped = await mapper(current)
      if (mapped) {
        results.push(mapped)
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, Math.max(items.length, 1)) }, () => worker()))
  return results
}
