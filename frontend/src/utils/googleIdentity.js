let gisScriptPromise = null;
const SDK_URL = 'https://accounts.google.com/gsi/client';

/** Share an in-flight load, but allow a fresh attempt after a failed load. */
export function loadGoogleIdentityScript() {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.accounts?.id) return Promise.resolve(true);
  if (gisScriptPromise) return gisScriptPromise;

  let script = document.querySelector(`script[src="${SDK_URL}"]`);
  const created = !script;
  if (created) {
    script = document.createElement('script');
    script.src = SDK_URL;
    script.async = true;
    script.defer = true;
  }
  const pending = new Promise((resolve, reject) => {
    const cleanup = () => {
      script.removeEventListener('load', onLoad);
      script.removeEventListener('error', onError);
    };
    const fail = () => {
      cleanup();
      script.remove();
      reject(new Error('GOOGLE_SCRIPT_LOAD_ERROR'));
    };
    const onLoad = () => {
      if (!window.google?.accounts?.id) { fail(); return; }
      cleanup();
      resolve(true);
    };
    const onError = () => fail();
    script.addEventListener('load', onLoad);
    script.addEventListener('error', onError);
    if (created) document.head.appendChild(script);
  });
  gisScriptPromise = pending.catch(error => {
    gisScriptPromise = null;
    throw error;
  });
  return gisScriptPromise;
}
