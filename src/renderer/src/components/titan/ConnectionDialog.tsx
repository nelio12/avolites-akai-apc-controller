import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { connectTitan } from '@/hooks/useAppController'
import { useAppStore } from '@/store/app-store'
import type { DiscoveredTitan } from '../../../../shared/ipc'

interface ConnectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps) {
  const titanHost = useAppStore((state) => state.titanHost)
  const titanPort = useAppStore((state) => state.titanPort)
  const titanStatus = useAppStore((state) => state.titanStatus)
  const titanError = useAppStore((state) => state.titanError)
  const titanVersion = useAppStore((state) => state.titanVersion)
  const [host, setHost] = useState(titanHost)
  const [port, setPort] = useState(String(titanPort))
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [found, setFound] = useState<DiscoveredTitan[]>([])

  useEffect(() => {
    if (!open) {
      return
    }
    setHost(useAppStore.getState().titanHost)
    setPort(String(useAppStore.getState().titanPort))
    void scanNetwork()
  }, [open])

  const scanNetwork = async (): Promise<void> => {
    setScanning(true)
    setScanError(null)
    try {
      const consoles = await window.api.titan.discover(useAppStore.getState().titanHost || host)
      setFound(consoles)
      const currentHost = useAppStore.getState().titanHost
      if (consoles.length === 1 && (currentHost === '127.0.0.1' || currentHost === 'localhost')) {
        setHost(consoles[0].host)
        setPort(String(consoles[0].port))
      }
    } catch (error) {
      setFound([])
      setScanError(error instanceof Error ? error.message : 'No se pudo buscar en la red.')
    } finally {
      setScanning(false)
    }
  }

  const submit = async (nextHost = host, nextPort = Number(port)): Promise<void> => {
    setHost(nextHost)
    setPort(String(nextPort))
    await connectTitan(nextHost, nextPort)
    if (useAppStore.getState().titanStatus === 'connected') {
      onOpenChange(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[min(480px,calc(100vw-2rem))]">
        <DialogTitle>Conexión Avolites Titan</DialogTitle>
        <DialogDescription>
          Busca consolas TitanNet en la red local (puerto 4430) o introduce la IP a mano.
        </DialogDescription>

        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium tracking-wide text-zinc-400 uppercase">Consolas en la red</p>
            <Button type="button" variant="secondary" size="sm" onClick={() => void scanNetwork()} disabled={scanning}>
              <Search className="h-3.5 w-3.5" />
              {scanning ? 'Buscando…' : 'Buscar'}
            </Button>
          </div>

          <div className="max-h-40 overflow-y-auto rounded-lg border border-zinc-800">
            {scanning && found.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">Escaneando la red local…</p>
            ) : found.length === 0 ? (
              <p className="px-3 py-4 text-center text-xs text-zinc-500">
                {scanError ?? 'No se ha encontrado ninguna consola. Comprueba que Titan está en la misma red.'}
              </p>
            ) : (
              found.map((consoleDevice) => (
                <button
                  key={`${consoleDevice.host}:${consoleDevice.port}`}
                  type="button"
                  className={`flex w-full flex-col items-start gap-0.5 border-b border-zinc-800 px-3 py-2 text-left last:border-b-0 hover:bg-zinc-900 ${
                    host === consoleDevice.host ? 'bg-amber-500/10' : ''
                  }`}
                  onClick={() => void submit(consoleDevice.host, consoleDevice.port)}
                >
                  <span className="text-sm text-white">
                    {consoleDevice.computerName ?? consoleDevice.hardware ?? consoleDevice.host}
                  </span>
                  <span className="text-[11px] text-zinc-500">
                    {consoleDevice.host}:{consoleDevice.port}
                    {consoleDevice.hardware ? ` · ${consoleDevice.hardware}` : ''}
                    {consoleDevice.version ? ` · Titan ${consoleDevice.version}` : ''}
                    {consoleDevice.showName ? ` · ${consoleDevice.showName}` : ''}
                  </span>
                </button>
              ))
            )}
          </div>

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault()
              void submit()
            }}
          >
            <label className="block text-xs font-medium text-zinc-400 uppercase">
              IP de la consola
              <Input className="mt-1" value={host} onChange={(event) => setHost(event.target.value)} placeholder="192.168.2.40" />
            </label>
            <label className="block text-xs font-medium text-zinc-400 uppercase">
              Puerto API
              <Input className="mt-1" value={port} onChange={(event) => setPort(event.target.value)} placeholder="4430" />
            </label>

            {titanVersion ? <p className="text-xs text-emerald-300">Software Titan {titanVersion}</p> : null}
            {titanError ? <p className="text-xs text-red-400">{titanError}</p> : null}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={titanStatus === 'connecting'}>
                {titanStatus === 'connecting' ? 'Conectando…' : 'Conectar'}
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
