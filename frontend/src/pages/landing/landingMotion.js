// Enhance visible HTML after mount; without browser motion APIs the page stays readable.
export function observeLandingReveals(root) {
  if (!root) return () => {};
  const view = root.ownerDocument.defaultView;
  const elements = [...root.querySelectorAll('[data-reveal]')];
  const preference = view.matchMedia?.('(prefers-reduced-motion: reduce)');
  let observer;
  const reveal = element => {
    element.dataset.revealed = 'true';
    observer?.unobserve(element);
  };
  const revealAll = () => {
    elements.forEach(reveal);
    observer?.disconnect();
  };
  if (!view.IntersectionObserver || preference?.matches) {
    revealAll();
    return () => {};
  }

  try {
    observer = new view.IntersectionObserver(entries => {
      entries.forEach(entry => { if (entry.isIntersecting) reveal(entry.target); });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    elements.forEach(element => {
      if (element.dataset.revealed === 'true') return;
      // Restored scroll positions must not leave content above the viewport concealed.
      if (element.getBoundingClientRect().bottom < 0) { reveal(element); return; }
      element.dataset.revealed = 'false';
      element.classList.add('is-reveal-ready');
      observer.observe(element);
    });
  } catch {
    revealAll();
    return () => {};
  }

  const onFocus = event => {
    let element = event.target.closest('[data-reveal]');
    while (element && root.contains(element)) {
      reveal(element);
      element = element.parentElement?.closest('[data-reveal]');
    }
  };
  const onPreference = event => { if (event.matches) revealAll(); };
  root.addEventListener('focusin', onFocus);
  preference?.addEventListener?.('change', onPreference);
  return () => {
    observer.disconnect();
    root.removeEventListener('focusin', onFocus);
    preference?.removeEventListener?.('change', onPreference);
    elements.forEach(element => element.classList.remove('is-reveal-ready'));
  };
}
