import type { TitanRequestPayload, TitanRequestResult } from '../shared/ipc'

const ALLOWED_PREFIX = '/titan/'

export class TitanProxyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TitanProxyError'
  }
}

export async function proxyTitanRequest(payload: TitanRequestPayload): Promise<TitanRequestResult> {
  const host = payload.host.trim()
  const port = payload.port
  const path = payload.path.startsWith('/') ? payload.path : `/${payload.path}`

  if (!host) {
    throw new TitanProxyError('La IP de Titan no puede estar vacía.')
  }

  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new TitanProxyError('El puerto de Titan no es válido.')
  }

  if (!path.startsWith(ALLOWED_PREFIX)) {
    throw new TitanProxyError('Solo se permiten rutas de la Titan Web API (/titan/).')
  }

  const url = `http://${host}:${port}${path}`
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), payload.timeoutMs ?? 4000)

  try {
    const response = await fetch(url, {
      method: payload.method ?? 'GET',
      signal: controller.signal,
      headers: payload.body
        ? { 'Content-Type': 'text/plain; charset=utf-8' }
        : { Accept: 'application/json, text/plain, */*' },
      body: payload.method === 'POST' ? payload.body : undefined
    })

    const text = await response.text()
    return {
      ok: response.ok,
      status: response.status,
      contentType: response.headers.get('content-type') ?? '',
      text
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TitanProxyError(`Tiempo de espera agotado al contactar ${host}:${port}.`)
    }

    const message = error instanceof Error ? error.message : 'Error de red desconocido'
    throw new TitanProxyError(`No se pudo conectar con Titan (${host}:${port}): ${message}`)
  } finally {
    clearTimeout(timeout)
  }
}
