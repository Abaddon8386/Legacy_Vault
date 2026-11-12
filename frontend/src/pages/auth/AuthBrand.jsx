import { ShieldCheck } from 'lucide-react';
import './AuthShell.css';

/**
 * Logo thương hiệu "LegacyVault" (icon khiên + tên) hiển thị đầu các màn đăng nhập, đăng ký và khôi phục mật khẩu.
 *
 * @returns {JSX.Element} Khối thương hiệu.
 */
export default function AuthBrand() {
  return <div className="lv-auth-brand">
    <ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" />
    <span>LegacyVault</span>
  </div>;
}
