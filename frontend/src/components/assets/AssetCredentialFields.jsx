import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

/**
 * Cặp ô nhập "tên đăng nhập" và "mật khẩu" cho tài sản loại CREDENTIAL; ô mật khẩu có nút con mắt để hiện/ẩn.
 * Dùng trong {@code AssetFormModal} (tạo mới) và {@code AssetEditModal} (sửa). Không gọi API.
 *
 * @param {object} props
 * @param {string} props.idPrefix Tiền tố id để gắn label với input.
 * @param {string} props.username Giá trị tên đăng nhập.
 * @param {string} props.password Giá trị mật khẩu.
 * @param {(field:('username'|'password'), value:string)=>void} props.onChange Gọi khi người dùng gõ.
 * @param {boolean} props.disabled Khóa các ô nhập.
 * @param {{credentialUsernameLabel:string, credentialPasswordLabel:string}} props.labels Nhãn đã dịch.
 * @param {string} [props.lang='vi'] Ngôn ngữ giao diện.
 * State nội bộ: {@code visible} (đang hiện mật khẩu hay không).
 */
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
