import { useCallback, useEffect, useRef, useState } from 'react';
import { request, ApiError } from '../../api/http.js';
import { fetchVault, readVault } from '../../utils/vaultService.js';
import OwnerCancelAlert from './OwnerCancelAlert.jsx';
import FeedbackNotice from '../common/FeedbackNotice.jsx';
import { Button } from '../common/Button.jsx';

/**
 * Cổng vào của chức năng "hủy cảnh báo" (cancel alert) của chủ hầm khi DMS ở trạng thái {@code GRACE_PERIOD_EXCEEDED}. Chỉ render khi có token, là chủ hầm và trạng thái đúng; ngược lại trả null.
 * Dùng trong {@code pages/dms/DMSOverviewPage.jsx}.
 */
export default function OwnerLiveCancelAlert(props) {
  if (!props.accessToken || !props.isOwner || props.dmsStatus !== 'GRACE_PERIOD_EXCEEDED') return null;
  return <LiveAlert key={`${props.ownerId}:${props.accessToken}`} {...props} />;
}
/**
 * Tải hầm hiện tại ({@code fetchVault} trong {@code utils/vaultService.js}, gọi {@code GET /vaults?page=0&size=20&sort=createdAt,desc}) để biết hầm có đang {@code AWAITING_VERIFICATION} không, rồi hiển thị {@code OwnerCancelAlert}.
 * Hành động hủy {@code cancel} gọi {@code POST /vaults/{vaultId}/cancel-alert} (200); kết quả phải có đúng id hầm và trạng thái {@code ACTIVE}, nếu không ném {@code INVALID_RESPONSE};
 * không cho hủy khi hầm không ở AWAITING_VERIFICATION (ném {@code ALERT_NOT_CANCELLABLE} 409). Lỗi tải hiển thị thông báo kèm nút thử lại.
 *
 * Props: {@code accessToken}, {@code ownerId}, {@code dmsStatus}, {@code lang}, {@code onUnauthorized}, {@code onRefreshRequired} (cha tải lại DMS sau khi hủy).
 * State: {@code vault}, {@code error}, {@code revision} (đếm số lần thử lại), {@code completed}.
 */
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
