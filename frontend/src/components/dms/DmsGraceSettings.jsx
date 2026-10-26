import { useEffect, useRef, useState } from 'react';
import { Button } from '../common/Button.jsx';
import FeedbackNotice from '../common/FeedbackNotice.jsx';
import { readDms } from '../../utils/dmsService.js';
import './DmsGraceSettings.css';

export default function DmsGraceSettings(props) {
  return <GraceSettings key={`${props.ownerId || ''}:${props.accessToken || ''}:${props.data?.status || ''}:${props.resetKey || 0}`} {...props} />;
}
function GraceSettings({ data, actions, ownerId, accessToken, lang = 'vi', isOwner = true, onSaved, onUnauthorized, onBusyChange, busy = false }) {
  const en = lang === 'en';
  const initialMinutes = data?.gracePeriodMinutes ?? (data?.gracePeriodDays ?? 0) * 1440;
  const split = total => ({ days: String(Math.floor(total / 1440)), hours: String(Math.floor(total % 1440 / 60)), minutes: String(total % 60) });
  const [draft, setDraft] = useState(() => split(initialMinutes));
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [confirmed, setConfirmed] = useState(null);
  const request = useRef(null);
  const busyCallback = useRef(onBusyChange);
  useEffect(() => { busyCallback.current = onBusyChange; }, [onBusyChange]);
  const policy = actions?.policy;
  const minuteMode = actions?.durationUnit === 'minutes';
  const min = minuteMode ? policy?.minMinutes : policy?.min * 1440;
  const max = minuteMode ? policy?.maxMinutes : policy?.max * 1440;
  const ready = typeof actions?.save === 'function' && Number.isSafeInteger(min) && min >= 0 && Number.isSafeInteger(max) && max >= min;
  const writable = isOwner && data?.status === 'MONITORING' && ready;
  const value = dirty ? draft : split(confirmed?.source === data ? confirmed.total : initialMinutes);
  const total = Number(value.days) * 1440 + Number(value.hours) * 60 + Number(value.minutes);
  const unsupportedPrecision = ready && !minuteMode && total % 1440 !== 0;
  const invalid = Object.values(value).every(part => part === '') || Object.values(value).some(part => !/^\d*$/.test(part)) || !Number.isSafeInteger(total) || Number(value.hours) > 23 || Number(value.minutes) > 59 || (ready && (total < min || total > max)) || unsupportedPrecision;
  const maxDays = ready ? Math.floor(max / 1440) : null;
  const maxText = ready ? (en ? `Maximum: ${maxDays} days.` : `Tối đa ${maxDays} ngày.`) : '';
  useEffect(() => () => { if (request.current) { request.current.abort(); request.current = null; busyCallback.current?.(false); } }, []);

  async function save(event) {
    event.preventDefault();
    if (request.current || busy || !writable || invalid || error) return;
    if (onBusyChange?.(true) === false) return;
    const c = new AbortController(); request.current = c;
    setPending(true); setSaved(false);
    try {
      const duration = minuteMode ? { gracePeriodMinutes: total } : { gracePeriodDays: total / 1440 };
      const raw = await actions.save({ checkIntervalMinutes: data.checkIntervalTotalMinutes, ...duration }, { accessToken, ownerId, lang, signal: c.signal });
      if (c.signal.aborted) return;
      const result = readDms(raw, { ownerId });
      if ((result.gracePeriodMinutes ?? result.gracePeriodDays * 1440) !== total || result.checkIntervalTotalMinutes !== data.checkIntervalTotalMinutes) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      setConfirmed({ source: data, total }); setDirty(false); setSaved(true); onSaved?.(result);
    } catch (err) {
      if (c.signal.aborted) return;
      if (err.status === 401) onUnauthorized?.();
      setError(err.status === 409 ? 'changed' : 'failed');
    } finally {
      if (request.current === c) { onBusyChange?.(false); request.current = null; if (!c.signal.aborted) setPending(false); }
    }
  }
  return <section className="lv-grace-settings lv-owner-card" aria-labelledby="grace-heading">
    <h2 id="grace-heading">{en ? 'Grace period' : 'Thời gian ân hạn'}</h2>
    <form onSubmit={save} noValidate>
      <div className="lv-grace-settings__row">
        {['days', 'hours', 'minutes'].map((unit, index) => <label key={unit} htmlFor={`grace-${unit}`}>{(en ? ['Days', 'Hours', 'Minutes'] : ['Ngày', 'Giờ', 'Phút'])[index]}
          <input id={`grace-${unit}`} type="number" placeholder="0" step="1" min="0" max={unit === 'hours' ? 23 : unit === 'minutes' ? 59 : undefined}
            value={value[unit]} disabled={!writable || busy || pending || Boolean(error)} aria-invalid={dirty && invalid} aria-describedby="grace-help"
            onChange={e => { setDraft({ ...value, [unit]: e.target.value }); setDirty(true); setSaved(false); }} />
        </label>)}
        <Button type="submit" isLoading={pending} disabled={!writable || busy || invalid || !dirty || Boolean(error)}>{en ? 'Save grace period' : 'Lưu thời gian ân hạn'}</Button>
      </div>
      <p id="grace-help">{!data ? (en ? 'Configure a check-in cycle first.' : 'Hãy thiết lập chu kỳ xác nhận trước.')
        : !ready ? (en ? 'Grace period changes are not available yet.' : 'Chưa hỗ trợ thay đổi thời gian ân hạn.')
        : !writable ? (en ? 'Grace period can only be changed while monitoring is active.' : 'Chỉ được đổi thời gian ân hạn khi hệ thống đang theo dõi bình thường.')
        : !minuteMode ? (en ? 'Current service supports whole days only.' : 'Dịch vụ hiện tại chỉ lưu được số ngày nguyên.') : `${maxText} ${en ? 'Unused fields can be left blank (0).' : 'Ô không dùng có thể để trống (tính là 0).'}`}</p>
      {dirty && invalid && <p role="alert">{unsupportedPrecision ? (en ? 'Minute precision is not supported by the current service.' : 'Dịch vụ chưa hỗ trợ lưu theo giờ, phút.') : (en ? `Enter a valid duration within the allowed range. ${maxText}` : `Nhập thời gian hợp lệ trong khoảng cho phép. ${maxText}`)}</p>}
    </form>
    {saved && <FeedbackNotice tone="success">{en ? 'Grace period saved.' : 'Đã lưu thời gian ân hạn.'}</FeedbackNotice>}
    {error && <FeedbackNotice tone="error">{error === 'changed'
      ? (en ? 'The status has changed. Reload before saving again.' : 'Trạng thái đã thay đổi. Hãy tải lại trước khi lưu tiếp.')
      : (en ? 'The save could not be confirmed. Your draft is preserved; check the current status before trying again.' : 'Chưa xác nhận được kết quả lưu. Bản nháp được giữ lại; hãy kiểm tra trạng thái trước khi thử lại.')}</FeedbackNotice>}
  </section>;
}
