import { useEffect, useRef } from 'react'

export function useModalFocus(isOpen, onClose, blocked = false, returnFocusRef = null) {
  const dialogRef = useRef(null)
  const closeRef = useRef(onClose)
  const blockedRef = useRef(blocked)
  useEffect(() => { closeRef.current = onClose; blockedRef.current = blocked }, [onClose, blocked])
  useEffect(() => {
    if (!isOpen) return
    const previousFocus = document.activeElement
    const returnTarget = returnFocusRef?.current || previousFocus
    const previousOverflow = document.body.style.overflow
    const dialog = dialogRef.current;
    if (!dialog) return;
    const controls = () => Array.from(dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]'))
    document.body.style.overflow = 'hidden'
    const firstInput = dialog.querySelector('input:not(:disabled)') || controls()[0] || dialog
    if (firstInput && typeof firstInput.focus === 'function') firstInput.focus();
    const onKeyDown = event => {
      if (event.key === 'Escape' && !blockedRef.current) { event.preventDefault(); closeRef.current() }
      if (event.key !== 'Tab') return
      const items = controls()
      if (!items.length) { event.preventDefault(); dialog.focus(); return }
      const first = items[0], last = items.at(-1)
      if (!dialog.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
        event.preventDefault(); (event.shiftKey ? last : first).focus()
      } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKeyDown)
      if (returnTarget?.isConnected && !returnTarget.disabled) returnTarget.focus()
    }
  }, [isOpen, returnFocusRef])
  return dialogRef
}
