import { useEffect, useState } from 'react'

/**
 * Hook to check if component is mounted (client-side only).
 * Prevents hydration mismatches when rendering client-only content.
 *
 * @returns true when component is mounted on client, false during SSR
 *
 * @example
 * const isMounted = useMounted()
 * if (!isMounted) return null // or return skeleton
 * return <ClientOnlyContent />
 */
export function useMounted() {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
