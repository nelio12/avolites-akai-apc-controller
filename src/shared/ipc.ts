export type TitanRequestPayload = {
  host: string
  port: number
  path: string
  method?: 'GET' | 'POST'
  body?: string
  timeoutMs?: number
}

export type TitanRequestResult = {
  ok: boolean
  status: number
  contentType: string
  text: string
}

export type AppSettings = {
  titanHost: string
  titanPort: number
}

export type MappingProfile = {
  version: 1 | 2
  name: string
  createdAt: string
  titan: {
    host: string
    port: number
  }
  mappings: unknown[]
}
