import { useEffect, useRef } from 'react'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([hidden]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * Keyboard behaviour every dialog needs: focus moves in when it opens (and again when `focusKey`
 * changes, e.g. a new step), Tab stays inside, Escape closes, and focus returns to what opened it.
 * Attach the returned ref to the dialog's panel.
 */
export function useModal<T extends HTMLElement>(onClose: () => void, focusKey: unknown = 0) {
  const ref = useRef<T>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => {
      const el = ref.current
      if (e.key === 'Escape') return close.current()
      if (e.key !== 'Tab' || !el) return
      const items = [...el.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!el.contains(active)) {
        e.preventDefault()
        first.focus()
      } else if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      opener?.focus?.()
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    // Prefer the first control inside the content over the close button in the header.
    ;(el?.querySelector<HTMLElement>(`.step ${FOCUSABLE.split(', ').join(', .step ')}`) ?? el?.querySelector<HTMLElement>(FOCUSABLE))?.focus()
  }, [focusKey])

  return ref
}
