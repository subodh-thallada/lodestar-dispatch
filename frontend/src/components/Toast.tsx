import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, TriangleAlert, XCircle } from 'lucide-react'
import { cx } from '../lib/format'

type Kind = 'success' | 'error' | 'warn' | 'info'
interface Toast {
  id: number
  kind: Kind
  title: string
  detail?: string
}

const Ctx = createContext<{ push: (kind: Kind, title: string, detail?: string) => void }>({ push: () => undefined })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])
  const seq = useRef(1)
  const push = useCallback((kind: Kind, title: string, detail?: string) => {
    const id = seq.current++
    setItems((s) => [...s, { id, kind, title, detail }])
    window.setTimeout(() => setItems((s) => s.filter((t) => t.id !== id)), kind === 'error' ? 9000 : 5000)
  }, [])
  const value = useMemo(() => ({ push }), [push])
  return (
    <Ctx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'warn' ? TriangleAlert : Info
          const color = t.kind === 'success' ? 'text-green-ink' : t.kind === 'error' ? 'text-red-ink' : t.kind === 'warn' ? 'text-yellow-ink' : 'text-road-ink'
          const edge = t.kind === 'success' ? 'border-t-green' : t.kind === 'error' ? 'border-t-red' : t.kind === 'warn' ? 'border-t-yellow' : 'border-t-road'
          return (
            <div key={t.id} className={cx('pointer-events-auto animate-lay-down border border-rule border-t-2 bg-paper-2 p-3 shadow-lift', edge)}>
              <div className="flex items-start gap-2">
                <Icon size={16} className={cx('mt-0.5 shrink-0', color)} />
                <div className="min-w-0">
                  <div className="font-condensed text-[14px] font-bold uppercase tracking-[0.06em] text-ink">{t.title}</div>
                  {t.detail && <div className="mt-0.5 break-words text-xs leading-snug text-ink-2">{t.detail}</div>}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
