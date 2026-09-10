/** Native modal where available; otherwise an in-flow preview with a reachable close button. */
export function openPublicDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) return
  if (typeof dialog.showModal === 'function') dialog.showModal()
  else {
    dialog.dataset.inlineFallback = 'true'
    dialog.setAttribute('open', '')
    dialog.setAttribute('role', 'dialog')
    dialog.setAttribute('aria-modal', 'false')
    dialog.querySelector<HTMLButtonElement>('button')?.focus()
  }
}
export function closePublicDialog(dialog: HTMLDialogElement | null): void {
  if (!dialog) return
  if (typeof dialog.close === 'function' && !dialog.dataset.inlineFallback) dialog.close()
  else dialog.removeAttribute('open')
}
