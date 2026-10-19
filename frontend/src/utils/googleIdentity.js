let gisScriptPromise = null;

/**
 * Loads the official Google Identity Services (GIS) script once.
 * Returns a promise that resolves when the SDK is available.
 */
export function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);

  if (!gisScriptPromise) {
    gisScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
      if (existing) {
        if (window.google?.accounts?.id) {
          resolve(true);
          return;
        }
        existing.addEventListener('load', () => resolve(true), { once: true });
        existing.addEventListener('error', (err) => reject(err), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => resolve(true);
      script.onerror = (err) => reject(err);
      document.head.appendChild(script);
    });
  }

  return gisScriptPromise;
}
