import { useEffect, useRef } from 'react'

const AD_CLIENT = 'ca-pub-7717846430402347'

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

/** A single AdSense display unit. Renders nothing visible until a real AD_CLIENT + slot is set. */
export function AdSlot({ slot, className }: { slot: string; className?: string }) {
  const ref = useRef<HTMLModElement>(null)
  const pushed = useRef(false)

  useEffect(() => {
    if (pushed.current || slot.includes('0000000000')) return
    pushed.current = true
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      // AdSense script not loaded (blocked, offline, etc.) — fail silently.
    }
  }, [])

  return (
    <ins
      ref={ref}
      className={`adsbygoogle ${className ?? ''}`}
      style={{ display: 'block' }}
      data-ad-client={AD_CLIENT}
      data-ad-slot={slot}
      data-ad-format="auto"
      data-full-width-responsive="true"
    />
  )
}
