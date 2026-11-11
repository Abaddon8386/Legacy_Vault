import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/** Username + password inputs for CREDENTIAL assets; the password has an eye button to show or hide it. */
export function AssetCredentialFields({ idPrefix, username, password, onChange, disabled, labels, lang = 'vi' }) {
  const [visible, setVisible] = useState(false);
  const toggleLabel = visible
    ? (lang === 'en' ? 'Hide password' : 'Ẩn mật khẩu')
    : (lang === 'en' ? 'Show password' : 'Hiện mật khẩu');
  return <>
    <div className="lv-form-group">
      <label className="lv-form-label" htmlFor={`${idPrefix}-username`}>{labels.credentialUsernameLabel}</label>
      <input id={`${idPrefix}-username`} className="lv-form-input" type="text" autoComplete="off"
        value={username} disabled={disabled} onChange={event => onChange('username', event.target.value)} />
    </div>
    <div className="lv-form-group">
      <label className="lv-form-label" htmlFor={`${idPrefix}-password`}>{labels.credentialPasswordLabel}</label>
      <div style={{ position: 'relative' }}>
        <input id={`${idPrefix}-password`} className="lv-form-input" type={visible ? 'text' : 'password'} autoComplete="new-password"
          style={{ paddingRight: '44px', width: '100%', boxSizing: 'border-box' }}
          value={password} disabled={disabled} onChange={event => onChange('password', event.target.value)} />
        <button type="button" onClick={() => setVisible(prev => !prev)} disabled={disabled}
          aria-label={toggleLabel} aria-pressed={visible} title={toggleLabel}
          style={{ position: 'absolute', right: '6px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none',
            color: 'var(--lv-text-muted, #68736b)', cursor: 'pointer', width: '32px', height: '32px', display: 'grid', placeItems: 'center' }}>
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  </>;
}
