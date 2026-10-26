import { useEffect, useState } from 'react';
import { loadStaffCase } from '../pages/staff/staffLiveService.js';

// Optional display metadata; permissions and mutations remain server-controlled.
export function useStaffCaseMetadata(caseId, provided, accessToken, lang, preview) {
  const [loaded, setLoaded] = useState(null);
  const known = provided && (!provided.caseId || provided.caseId === caseId) ? provided : null;
  useEffect(() => {
    if (preview || !accessToken || known?.caseNumber || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(caseId || '')) return;
    const controller = new AbortController();
    loadStaffCase(caseId, {accessToken, lang, signal: controller.signal})
      .then(item => { if (!controller.signal.aborted) setLoaded({caseId, accessToken, item}); })
      .catch(() => { /* Display metadata never substitutes for an authorized workflow response. */ });
    return () => controller.abort();
  }, [caseId, accessToken, lang, preview, known?.caseNumber]);
  const current = loaded?.caseId === caseId && loaded.accessToken === accessToken ? loaded.item : null;
  return current ? {...current, ...known} : known;
}
