import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { connectTitan } from '@/hooks/useAppController'
import { useAppStore } from '@/store/app-store'

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

  const submit = async (): Promise<void> => {
    const parsedPort = Number(port)
    await connectTitan(host, parsedPort)
    if (useAppStore.getState().titanStatus === 'connected') {
      onOpenChange(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setHost(useAppStore.getState().titanHost)
        setPort(String(useAppStore.getState().titanPort))
        onOpenChange(next)
      }}
    >
      <DialogContent>
        <DialogTitle>Conexión Avolites Titan</DialogTitle>
        <DialogDescription>
          La Titan Web API usa HTTP en el puerto 4430. La consola y este ordenador deben estar en la misma red.
        </DialogDescription>

        <form
          className="mt-4 space-y-3"
          onSubmit={(event) => {
            event.preventDefault()
            void submit()
          }}
        >
          <label className="block text-xs font-medium text-zinc-400 uppercase">
            IP de la consola
            <Input className="mt-1" value={host} onChange={(event) => setHost(event.target.value)} placeholder="10.0.0.1" />
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
      </DialogContent>
    </Dialog>
  )
}
