import { useEffect, useRef, useState } from 'react'

/** Animates a number up from 0 once, terminal-style; static under reduced motion. */
export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [n, setN] = useState(value)
  const first = useRef(true)
  useEffect(() => {
    if (!first.current || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setN(value)
      return
    }
    first.current = false
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 600)
      setN(value * (1 - (1 - k) ** 3))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{format(n)}</>
}
