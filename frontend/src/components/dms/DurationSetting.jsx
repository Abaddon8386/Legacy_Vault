import { useState } from 'react';
import { Button } from '../common/Button.jsx';
import DurationFields from './DurationFields.jsx';
import { formatDurationMinutes } from './durationFormat.js';
import './DurationSetting.css';

/** One time setting: a read-only value when locked, otherwise presets with a custom option. Save appears only after a change. */
export default function DurationSetting({ id, title, className = '', lang = 'vi', savedTotal, total, presets = [], onPreset, legend, fields, help, helpId, error, errorId,
  dirty, disabled, saving, saveDisabled, onSubmit, onCancel, locked, lockedText, children }) {
  const en = lang === 'en';
  const [custom, setCustom] = useState(false);
  // A value that matches no preset can only be shown in the custom fields.
  const showFields = custom || !presets.some(preset => preset.minutes === total);
  const current = savedTotal === undefined ? null : formatDurationMinutes(savedTotal, lang);
  if (locked) return <section className={`lv-duration-setting is-locked ${className}`} aria-labelledby={id}>
    <h3 id={id}>{title}</h3>
    {current && <strong>{current}</strong>}
    {lockedText && <p>{lockedText}</p>}
  </section>;
  return <section className={`lv-duration-setting ${className}`} aria-labelledby={id}>
    <div className="lv-duration-setting__head">
      <h3 id={id}>{title}</h3>
      {current && <span>{en ? 'Current: ' : 'Hiện tại: '}<strong>{current}</strong></span>}
    </div>
    <form onSubmit={onSubmit} noValidate>
      <div className="lv-dms-presets-grid" role="group" aria-label={title}>
        {presets.map(preset => <button key={preset.minutes} type="button" disabled={disabled}
          className={`lv-dms-preset-pill${!showFields && total === preset.minutes ? ' is-active' : ''}`} aria-pressed={!showFields && total === preset.minutes}
          onClick={() => { setCustom(false); onPreset(preset); }}>{preset.label}</button>)}
        <button type="button" disabled={disabled} className={`lv-dms-preset-pill is-custom${showFields ? ' is-active' : ''}`} aria-pressed={showFields}
          onClick={() => setCustom(true)}>{en ? 'Custom' : 'Tùy chỉnh'}</button>
      </div>
      <div className="lv-duration-setting__custom" hidden={!showFields}>
        <DurationFields legend={legend} fields={fields} disabled={disabled} describedBy={error && errorId ? errorId : helpId} />
        {help && <p id={helpId}>{help}</p>}
      </div>
      {error && <p id={errorId} className="lv-duration-setting__error" role="alert">{error}</p>}
      {dirty && <div className="lv-duration-setting__actions">
        <Button type="submit" className="lv-dms-submit-btn" isLoading={saving} disabled={saveDisabled || disabled}>{en ? 'Save' : 'Lưu'}</Button>
        {onCancel && <Button variant="secondary" disabled={saving} onClick={() => { setCustom(false); onCancel(); }}>{en ? 'Cancel' : 'Hủy'}</Button>}
        {saving && <span className="lv-duration-setting__saving" role="status" aria-busy="true">{en ? 'Saving…' : 'Đang lưu…'}</span>}
      </div>}
    </form>
    {children}
  </section>;
}
