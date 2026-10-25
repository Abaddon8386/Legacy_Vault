import { useCallback, useEffect, useRef, useState } from 'react';
import { request, ApiError } from '../../api/http.js';
import { fetchVault, readVault } from '../../utils/vaultService.js';
import OwnerCancelAlert from './OwnerCancelAlert.jsx';
import FeedbackNotice from '../common/FeedbackNotice.jsx';
import { Button } from '../common/Button.jsx';

export default function OwnerLiveCancelAlert(props) {
  if (!props.accessToken || !props.isOwner || props.dmsStatus !== 'GRACE_PERIOD_EXCEEDED') return null;
  return <LiveAlert key={`${props.ownerId}:${props.accessToken}`} {...props} />;
}
function LiveAlert({ accessToken, ownerId, dmsStatus, lang = 'vi', onUnauthorized, onRefreshRequired }) {
  const [vault, setVault] = useState(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [completed, setCompleted] = useState(false);
  const unauthorized = useRef(onUnauthorized);
  useEffect(() => { unauthorized.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    const c = new AbortController();
    fetchVault({ accessToken, lang, signal: c.signal }).then(value => {
      if (!c.signal.aborted) { setVault(value); setError(false); }
    }).catch(err => { if (!c.signal.aborted) { setVault(null); setError(true); if (err.status === 401) unauthorized.current?.(); } });
    return () => c.abort();
  }, [accessToken, lang, revision]);
  const cancel = useCallback(async signal => {
    if (completed || vault?.status !== 'AWAITING_VERIFICATION') throw new ApiError('ALERT_NOT_CANCELLABLE', 409);
    const raw = await request(`/vaults/${encodeURIComponent(vault.id)}/cancel-alert`, { accessToken, lang, signal, method: 'POST', expectedStatus: 200 });
    const result = readVault(raw);
    if (result.id !== vault.id || result.status !== 'ACTIVE') throw new ApiError('INVALID_RESPONSE');
    return result;
  }, [vault, completed, accessToken, lang]);
  if (error) return <FeedbackNotice tone="warning" action={<Button variant="secondary" onClick={() => setRevision(v => v + 1)}>{lang === 'en' ? 'Retry' : 'Thử lại'}</Button>}>
    {lang === 'en' ? 'Could not check whether this alert can be cancelled.' : 'Chưa kiểm tra được điều kiện hủy cảnh báo.'}
  </FeedbackNotice>;
  return <OwnerCancelAlert lang={lang} dmsStatus={dmsStatus} ownerId={ownerId} isOwner
    canCancel={!completed && vault?.status === 'AWAITING_VERIFICATION'} onCancelAlert={cancel}
    onRefreshRequired={() => { onRefreshRequired?.(); setCompleted(true); }} onUnauthorized={onUnauthorized} />;
}
