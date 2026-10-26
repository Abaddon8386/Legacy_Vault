// Retire the old review URL in favor of the authenticated application and its API.
const requested = new URLSearchParams(window.location.search);
const params = new URLSearchParams({ lang: requested.get('lang') === 'en' ? 'en' : 'vi' });
const caseId = requested.get('caseId');
if (/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(caseId || '')) params.set('caseId', caseId);
window.location.replace(`/legal/death-verification?${params}`);
