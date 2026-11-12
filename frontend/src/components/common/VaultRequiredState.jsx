import EmptyState from './EmptyState.jsx';
import './VaultRequiredState.css';

/**
 * Chuỗi song ngữ cho thông báo "cần tạo kho di sản trước" theo từng màn hình (assets, wills, beneficiaries).
 */
const COPY = {
  vi: {
    badge: 'CẦN KHỞI TẠO KHO',
    title: 'Bạn chưa có kho di sản số',
    cta: 'Đến kho di sản',
    assets: 'Hãy tạo kho di sản trước khi thêm tài sản số.',
    wills: 'Hãy tạo kho di sản trước khi tải bản di chúc số hóa.',
    beneficiaries: 'Hãy tạo kho di sản trước khi khai báo người thi hành bên ngoài và người thụ hưởng.',
  },
  en: {
    badge: 'VAULT REQUIRED',
    title: 'No heritage vault yet',
    cta: 'Go to Vault',
    assets: 'Create your heritage vault before adding assets.',
    wills: 'Create your heritage vault before uploading a digitized will.',
    beneficiaries: 'Create your heritage vault before adding trustees or beneficiaries.',
  },
};

/**
 * Thông báo dùng chung "hãy tạo kho di sản trước" cho các màn hình tài sản, di chúc và người thụ hưởng khi chủ hầm chưa có hầm. Bọc {@code EmptyState}.
 *
 * @param {object} props
 * @param {('assets'|'wills'|'beneficiaries')} [props.kind='assets']
 * @param {string} [props.lang='vi']
 * @param {()=>void} props.onNavigateToVault Chuyển tới trang kho di sản.
 */
export default function VaultRequiredState({ kind = 'assets', lang = 'vi', onNavigateToVault }) {
  const t = COPY[lang] || COPY.vi;
  return (
    <div className="lv-vault-required">
      <EmptyState
        lang={lang}
        badge={t.badge}
        title={t.title}
        description={t[kind] || t.assets}
        actionLabel={t.cta}
        onAction={onNavigateToVault}
      />
    </div>
  );
}
