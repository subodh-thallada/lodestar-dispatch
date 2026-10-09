import type { ReactNode } from 'react'
import { cx } from '../lib/format'

export type Tone = 'neutral' | 'good' | 'bad' | 'warn' | 'info' | 'accent'

/* ------------------------------------------------------------------ panels */

/**
 * A printed section. `ruled` (the default) is a region of the page headed by a rule, the
 * atlas idiom; `boxed` draws the one kind of box an atlas prints: a legend / inset frame.
 */
export function Panel({ title, subtitle, right, children, className, bodyClassName, boxed }: { title?: ReactNode; subtitle?: ReactNode; right?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string; boxed?: boolean }) {
  return (
    <section className={cx(boxed ? 'border border-ink/80 bg-paper-2' : 'border-t-2 border-ink', className)}>
      {(title || right) && (
        <header className={cx('flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-rule pb-2.5 pt-3', boxed ? 'px-4' : 'px-1')}>
          <div className="min-w-0">
            {title && <h2 className="font-condensed text-[17px] font-bold uppercase tracking-[0.08em] text-ink">{title}</h2>}
            {subtitle && <p className="mt-0.5 text-xs text-ink-3">{subtitle}</p>}
          </div>
          {right && <div className="flex flex-wrap items-center gap-2">{right}</div>}
        </header>
      )}
      <div className={bodyClassName ?? (boxed ? 'p-4' : 'px-1 py-3')}>{children}</div>
    </section>
  )
}

/* ------------------------------------------------------------------ badges */

const tagTone: Record<Tone, string> = {
  neutral: 'border-rule-2 text-ink-2',
  good: 'border-green text-green-ink',
  bad: 'border-red text-red-ink',
  warn: 'border-yellow-ink/60 text-yellow-ink',
  info: 'border-road text-road-ink',
  accent: 'border-carbon text-carbon-ink',
}

export function Tag({ tone = 'neutral', children, className, title }: { tone?: Tone; children: ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cx('inline-flex h-[18px] items-center gap-1 whitespace-nowrap border px-1.5 font-condensed text-[11px] font-semibold uppercase tracking-[0.06em] leading-none', tagTone[tone], className)}>
      {children}
    </span>
  )
}

/** Legend entry: a coloured dot and a label, the atlas' own status vocabulary. */
export function Legend({ tone = 'neutral', children, title, pulse }: { tone?: Tone; children: ReactNode; title?: string; pulse?: boolean }) {
  const dot: Record<Tone, string> = { neutral: 'bg-rule-2', good: 'bg-green', bad: 'bg-red', warn: 'bg-yellow-ink', info: 'bg-road', accent: 'bg-carbon' }
  return (
    <span title={title} className="inline-flex items-center gap-1.5 whitespace-nowrap font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-2">
      <span className={cx('h-2 w-2 rounded-full', dot[tone], pulse && 'animate-pulse')} />
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ shields */

/** Route shields mark load type: the interstate shield for Book-It-Now, the US-route shield for open bids. */
export function Shield({ kind, className }: { kind: 'bin' | 'bid'; className?: string }) {
  if (kind === 'bin') {
    return (
      <svg viewBox="0 0 40 36" className={cx('h-[30px] w-[34px] shrink-0', className)} aria-label="Book-It-Now" role="img">
        <path d="M3 4 Q20 0 37 4 L37 20 Q37 31 20 35 Q3 31 3 20 Z" fill="var(--color-road)" stroke="var(--color-paper-2)" strokeWidth="1.5" />
        <path d="M3 4 Q20 0 37 4 L37 10 L3 10 Z" fill="var(--color-red)" />
        <text x="20" y="27" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="12" fill="#fff" letterSpacing="0.5">
          BIN
        </text>
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 40 36" className={cx('h-[30px] w-[34px] shrink-0', className)} aria-label="Open bid" role="img">
      <path d="M6 2 H34 Q37 2 36 6 Q34 16 36 26 Q33 34 20 35 Q7 34 4 26 Q6 16 4 6 Q3 2 6 2 Z" fill="var(--color-paper-2)" stroke="var(--color-ink)" strokeWidth="1.6" />
      <text x="20" y="23" textAnchor="middle" fontFamily="Barlow Condensed, sans-serif" fontWeight="700" fontSize="12" fill="var(--color-ink)" letterSpacing="0.5">
        BID
      </text>
    </svg>
  )
}

/* ------------------------------------------------------------------ stamps */

const stampTone: Record<Tone, string> = {
  neutral: 'border-ink-2 text-ink-2',
  good: 'border-green text-green',
  bad: 'border-red text-red',
  warn: 'border-yellow-ink text-yellow-ink',
  info: 'border-road text-road',
  accent: 'border-carbon text-carbon',
}

/**
 * An inked rubber stamp: thick border, uneven ink coverage from a turbulence mask, laid
 * down slightly off-square and multiplied into the paper. `pressed` plays the press-in once.
 */
export function Stamp({ tone = 'neutral', children, pressed, size = 'md', className }: { tone?: Tone; children: ReactNode; pressed?: boolean; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const sz = size === 'lg' ? 'border-[3px] px-3.5 py-1 text-[26px] tracking-[0.16em]' : size === 'md' ? 'border-[2.5px] px-2 py-[3px] text-[15px] tracking-[0.14em]' : 'border-2 px-1.5 py-[2px] text-[12px] tracking-[0.12em]'
  return (
    <span className={cx('stamp inline-flex select-none items-center justify-center whitespace-nowrap font-condensed font-bold uppercase leading-none mix-blend-multiply', sz, stampTone[tone], pressed ? 'animate-stamp' : '-rotate-2', className)}>
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ buttons */

export function Button({ children, onClick, tone = 'neutral', disabled, size = 'md', className, title, type = 'button' }: { children: ReactNode; onClick?: () => void; tone?: Tone; disabled?: boolean; size?: 'sm' | 'md'; className?: string; title?: string; type?: 'button' | 'submit' }) {
  const base = 'inline-flex items-center justify-center gap-1.5 border font-condensed font-bold uppercase tracking-[0.08em] transition-[background-color,color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 disabled:active:translate-y-0'
  const sz = size === 'sm' ? 'h-7 px-2.5 text-[12px]' : 'h-9 px-3.5 text-[13px]'
  const tones: Record<Tone, string> = {
    neutral: 'border-rule-2 bg-paper-2 text-ink hover:border-ink-2 hover:bg-paper',
    good: 'border-green-ink bg-green text-white hover:bg-green-ink',
    bad: 'border-red-ink bg-paper-2 text-red-ink hover:bg-red-soft',
    warn: 'border-yellow-ink bg-yellow text-ink hover:bg-yellow-soft',
    info: 'border-road-ink bg-road text-white hover:bg-road-ink',
    accent: 'border-carbon-ink bg-carbon text-white hover:bg-carbon-ink',
  }
  return (
    <button type={type} title={title} disabled={disabled} onClick={onClick} className={cx(base, sz, tones[tone], className)}>
      {children}
    </button>
  )
}

/** Segmented control drawn as index tabs on a rule. */
export function Seg<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: [T, string][]; className?: string }) {
  return (
    <div className={cx('inline-flex items-stretch border border-rule-2 bg-paper', className)} role="tablist">
      {options.map(([v, label], i) => (
        <button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={cx(
            'px-2.5 py-1 font-condensed text-[12px] font-semibold uppercase tracking-[0.06em] transition-colors duration-150',
            i > 0 && 'border-l border-rule-2',
            value === v ? 'bg-ink text-paper-2' : 'text-ink-2 hover:bg-paper-3 hover:text-ink',
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ misc */

export function Bar({ value, max, tone = 'info', className }: { value: number; max: number; tone?: Tone; className?: string }) {
  const w = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  const color: Record<Tone, string> = { neutral: 'bg-ink-3', good: 'bg-green', bad: 'bg-red', warn: 'bg-yellow', info: 'bg-road', accent: 'bg-carbon' }
  return (
    <div className={cx('h-1.5 w-full overflow-hidden bg-paper-3', className)}>
      <div className={cx('h-full transition-[width] duration-300 ease-out', color[tone])} style={{ width: `${w}%` }} />
    </div>
  )
}

export function Empty({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="border-y border-dashed border-rule-2 px-4 py-8 text-center">
      <div className="text-sm text-ink-2">{children}</div>
      {hint && <div className="mt-1 text-xs text-ink-3">{hint}</div>}
    </div>
  )
}

/** Column head in the atlas' mileage-table voice. */
export function Th({ children, className, right }: { children?: ReactNode; className?: string; right?: boolean }) {
  return <th className={cx('label whitespace-nowrap py-1.5 pr-3 font-semibold', right && 'text-right', className)}>{children}</th>
}

export function Figure({ label, value, sub, tone = 'neutral', className }: { label: string; value: ReactNode; sub?: ReactNode; tone?: Tone; className?: string }) {
  const color: Record<Tone, string> = { neutral: 'text-ink', good: 'text-green-ink', bad: 'text-red-ink', warn: 'text-yellow-ink', info: 'text-road-ink', accent: 'text-carbon-ink' }
  return (
    <div className={cx('min-w-0', className)}>
      <div className="label">{label}</div>
      <div className={cx('num mt-1 font-condensed text-[22px] font-bold leading-none', color[tone])}>{value}</div>
      {sub && <div className="num mt-1 truncate text-[11px] text-ink-3">{sub}</div>}
    </div>
  )
}
