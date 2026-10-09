import { useEffect, useRef, useState } from 'react'
import type { ClockSnap } from '../types'
import { parseTs } from '../lib/format'

/** Keeps a locally-ticking copy of the board's simulation clock. */
export function useSimClock(snap: ClockSnap | null, tickMs = 250) {
  const ref = useRef<{ simAt: number; wallAt: number; speed: number }>({ simAt: Date.now(), wallAt: Date.now(), speed: 1 })
  const [simNow, setSimNow] = useState<number>(Date.now())

  useEffect(() => {
    if (!snap) return
    ref.current = { simAt: parseTs(snap.sim_time_utc), wallAt: Date.now(), speed: snap.simulation_speed || 1 }
    setSimNow(ref.current.simAt)
  }, [snap])

  useEffect(() => {
    const id = window.setInterval(() => {
      const { simAt, wallAt, speed } = ref.current
      setSimNow(simAt + (Date.now() - wallAt) * speed)
    }, tickMs)
    return () => window.clearInterval(id)
  }, [tickMs])

  return { simNow, speed: ref.current.speed }
}
