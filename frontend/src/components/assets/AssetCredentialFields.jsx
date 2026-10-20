export function AssetCredentialFields({ idPrefix, username, password, onChange, disabled, labels }) {
  return <>
    <div className="lv-form-group">
      <label className="lv-form-label" htmlFor={`${idPrefix}-username`}>{labels.credentialUsernameLabel}</label>
      <input id={`${idPrefix}-username`} className="lv-form-input" type="text" autoComplete="off"
        value={username} disabled={disabled} onChange={event => onChange('username', event.target.value)} />
    </div>
    <div className="lv-form-group">
      <label className="lv-form-label" htmlFor={`${idPrefix}-password`}>{labels.credentialPasswordLabel}</label>
      <input id={`${idPrefix}-password`} className="lv-form-input" type="password" autoComplete="new-password"
        value={password} disabled={disabled} onChange={event => onChange('password', event.target.value)} />
    </div>
  </>;
}
