import { useEffect, useRef, useState } from 'react';
import FeedbackNotice from '../common/FeedbackNotice.jsx';
import { readDms } from '../../utils/dmsService.js';
import DurationSetting from './DurationSetting.jsx';

const PRESET_DAYS = [1, 3, 7, 14];

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
  const savedTotal = data ? (confirmed?.source === data ? confirmed.total : initialMinutes) : undefined;
  const lockedText = !data ? (en ? 'Set a check-in interval first.' : 'Hãy thiết lập chu kỳ kiểm tra trước.')
    : !ready ? (en ? 'Not available yet.' : 'Chưa hỗ trợ thay đổi.')
    : data.status === 'MONITORING' ? (en ? 'Only the vault owner can change this.' : 'Chỉ chủ kho mới đổi được.') : null;
  const locked = !writable;
  const blocked = busy || pending || Boolean(error);
  return <DurationSetting id="grace-heading" className="lv-grace-settings" title={en ? 'Grace period' : 'Thời gian ân hạn'} lang={lang}
    locked={locked} lockedText={lockedText} savedTotal={savedTotal} total={total}
    presets={PRESET_DAYS.filter(days => days * 1440 >= min && days * 1440 <= max).map(days => ({ minutes: days * 1440, label: en ? `${days} day${days > 1 ? 's' : ''}` : `${days} ngày` }))}
    onPreset={preset => { setDraft(split(preset.minutes)); setDirty(true); setSaved(false); }}
    legend={en ? 'Grace period length' : 'Thời lượng ân hạn'} helpId="grace-help" help={minuteMode ? maxText : (en ? 'Whole days only.' : 'Chỉ lưu được số ngày nguyên.')}
    error={dirty && invalid ? (unsupportedPrecision ? (en ? 'Minutes are not supported yet.' : 'Chưa hỗ trợ lưu theo giờ, phút.') : (en ? `Enter a value within the limit. ${maxText}` : `Hãy nhập giá trị trong giới hạn. ${maxText}`)) : null}
    disabled={blocked} saving={pending} saveDisabled={invalid} dirty={dirty && total !== savedTotal} onSubmit={save}
    onCancel={() => { setDirty(false); setSaved(false); }}
    fields={['days', 'hours', 'minutes'].map((unit, index) => ({ id: `grace-${unit}`, label: (en ? ['Days', 'Hours', 'Minutes'] : ['Số ngày', 'Số giờ', 'Số phút'])[index],
      placeholder: '0', max: unit === 'hours' ? 23 : unit === 'minutes' ? 59 : undefined, value: value[unit], invalid: dirty && invalid,
      onChange: e => { setDraft({ ...value, [unit]: e.target.value }); setDirty(true); setSaved(false); } }))}>
    {saved && <div className="lv-grace-feedback"><FeedbackNotice tone="success">{en ? 'Grace period saved.' : 'Đã lưu thời gian ân hạn.'}</FeedbackNotice></div>}
    {error && <div className="lv-grace-feedback"><FeedbackNotice tone="error">{error === 'changed'
      ? (en ? 'The status has changed. Reload before saving again.' : 'Trạng thái đã thay đổi. Hãy tải lại trước khi lưu tiếp.')
      : (en ? 'The save could not be confirmed. Check the current status before trying again.' : 'Chưa xác nhận được kết quả lưu. Hãy kiểm tra trạng thái trước khi thử lại.')}</FeedbackNotice></div>}
  </DurationSetting>;
}
