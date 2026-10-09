import type { ReactNode } from 'react'
import { cx } from '../lib/format'

export function Panel({ title, subtitle, right, children, className }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx('rounded-xl border border-slate-800 bg-slate-900/70 backdrop-blur', className)}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-3 border-b border-slate-800 px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-wide text-slate-100">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
          {right && <div className="flex items-center gap-2">{right}</div>}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'accent'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-slate-800 text-slate-200 ring-slate-700',
  good: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/30',
  bad: 'bg-rose-500/15 text-rose-300 ring-rose-500/30',
  warn: 'bg-amber-500/15 text-amber-300 ring-amber-500/30',
  info: 'bg-sky-500/15 text-sky-300 ring-sky-500/30',
  accent: 'bg-violet-500/15 text-violet-300 ring-violet-500/30',
}

export function Badge({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ring-1 ring-inset', toneClass[tone], className)}>
      {children}
    </span>
  )
}

export function Stat({ label, value, sub, tone = 'neutral', className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  const color = tone === 'good' ? 'text-emerald-300' : tone === 'bad' ? 'text-rose-300' : tone === 'warn' ? 'text-amber-300' : tone === 'info' ? 'text-sky-300' : 'text-slate-100'
  return (
    <div className={cx('rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2', className)}>
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className={cx('mt-0.5 text-lg font-semibold tabular-nums', color)}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400">{sub}</div>}
    </div>
  )
}

export function Button({ children, onClick, tone = 'neutral', disabled, size = 'md', className, title, type = 'button' }: { children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; size?: 'sm' | 'md'; className?: string; title?: string; type?: 'button' | 'submit' }) {
  const base = 'inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:cursor-not-allowed disabled:opacity-40'
  const sz = size === 'sm' ? 'px-2 py-1 text-xs' : 'px-3 py-1.5 text-sm'
  const tones: Record<Tone, string> = {
    neutral: 'bg-slate-800 text-slate-100 hover:bg-slate-700',
    good: 'bg-emerald-600 text-white hover:bg-emerald-500',
    bad: 'bg-rose-600 text-white hover:bg-rose-500',
    warn: 'bg-amber-600 text-white hover:bg-amber-500',
    info: 'bg-sky-600 text-white hover:bg-sky-500',
    accent: 'bg-violet-600 text-white hover:bg-violet-500',
  }
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={cx(base, sz, tones[tone], className)}>
      {children}
    </button>
  )
}

export function Bar({ value, max, tone = 'info', className }: { value: number; max: number; tone?: Tone; className?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color = tone === 'good' ? 'bg-emerald-500' : tone === 'bad' ? 'bg-rose-500' : tone === 'warn' ? 'bg-amber-500' : tone === 'accent' ? 'bg-violet-500' : 'bg-sky-500'
  return (
    <div className={cx('h-1.5 w-full overflow-hidden rounded bg-slate-800', className)}>
      <div className={cx('h-full rounded', color)} style={{ width: `${w}%` }} />
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-800 px-4 py-8 text-center text-sm text-slate-500">{children}</div>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-700 bg-slate-800 px-1 font-mono text-[10px] text-slate-300">{children}</kbd>
}
