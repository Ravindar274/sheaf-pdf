import { useEffect, useRef } from 'react'

// Swap for your real AdSense publisher ID (also update index.html's script tag).
const AD_CLIENT = 'ca-pub-0000000000000000'

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
    if (pushed.current || AD_CLIENT.includes('0000000000000000')) return
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
