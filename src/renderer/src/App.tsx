import { AppHeader } from '@/components/layout/AppHeader'
import { ApcMiniController } from '@/components/apc/ApcMiniController'
import { MappingInspector } from '@/components/mapping/MappingInspector'
import { PlaybackSidebar } from '@/components/titan/PlaybackSidebar'
import { useAppController } from '@/hooks/useAppController'

export default function App() {
  useAppController()

  return (
    <div className="flex h-screen flex-col bg-zinc-950 text-zinc-100">
      <AppHeader />
      <main className="flex min-h-0 flex-1">
        <PlaybackSidebar />
        <section className="min-w-0 flex-1 bg-[radial-gradient(circle_at_top,#1c1917_0%,#09090b_55%)]">
          <ApcMiniController />
        </section>
        <MappingInspector />
      </main>
    </div>
  )
}
