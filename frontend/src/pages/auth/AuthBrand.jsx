import { ShieldCheck } from 'lucide-react';
import './AuthShell.css';

export default function AuthBrand() {
  return <div className="lv-auth-brand">
    <ShieldCheck size={30} strokeWidth={1.5} aria-hidden="true" />
    <span>LegacyVault</span>
  </div>;
}
