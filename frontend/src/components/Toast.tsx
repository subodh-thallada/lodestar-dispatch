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
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? XCircle : t.kind === 'warn' ? TriangleAlert : Info
          const color = t.kind === 'success' ? 'border-emerald-500/40 text-emerald-300' : t.kind === 'error' ? 'border-rose-500/40 text-rose-300' : t.kind === 'warn' ? 'border-amber-500/40 text-amber-300' : 'border-sky-500/40 text-sky-300'
          return (
            <div key={t.id} className={cx('pointer-events-auto rounded-lg border bg-slate-900/95 p-3 shadow-xl backdrop-blur', color)}>
              <div className="flex items-start gap-2">
                <Icon size={16} className="mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-sm font-medium text-slate-100">{t.title}</div>
                  {t.detail && <div className="mt-0.5 break-words text-xs text-slate-300">{t.detail}</div>}
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
