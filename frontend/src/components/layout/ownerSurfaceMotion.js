// Event delegation keeps async cards working without observers or a render per pointer move.
export function trackOwnerSurface(event) {
  const root = event.currentTarget;
  if ((!root.classList.contains('lv-owner-surfaces') && !root.classList.contains('lv-staff-surfaces')) || event.pointerType === 'touch') return;
  const view = root.ownerDocument.defaultView;
  if (view.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const card = event.target.closest?.('.lv-owner-card, .lv-staff-glow');
  if (!card || !root.contains(card)) return;
  const bounds = card.getBoundingClientRect();
  card.style.setProperty('--surface-x', `${event.clientX - bounds.left}px`);
  card.style.setProperty('--surface-y', `${event.clientY - bounds.top}px`);
}
