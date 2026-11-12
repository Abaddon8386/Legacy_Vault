import { UsersRound, Vault, ClipboardList, ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useAdminQuery } from './useAdminQuery.js';
import { adminI18n } from './adminI18n.js';
import { fetchAdminOverview } from '../../utils/adminService.js';
import './AdminPages.css';

/**
 * Danh sách thẻ số liệu tổng quan: mỗi phần tử là cặp [khóa trong dữ liệu `GET /api/v1/admin/overview`, icon lucide].
 * Khóa cũng là khóa i18n trong `adminI18n` để lấy nhãn hiển thị.
 */
const metrics = [
  ['totalAccounts', UsersRound], ['activeVaults', Vault],
  ['processingCases', ClipboardList], ['totalRolesAssigned', ShieldCheck],
];
/**
 * Danh sách vai trò hiển thị trong khối phân bố vai trò: [mã vai trò (không có tiền tố ROLE_), khóa i18n của nhãn].
 * Giá trị đếm lấy từ `data.roleDistribution[mã]` của API tổng quan.
 */
const roles = [
  ['VAULT_OWNER', 'roleOwner'], ['BENEFICIARY', 'roleBeneficiary'],
  ['STAFF_EXECUTOR', 'roleStaff'], ['LEGAL_VERIFIER', 'roleLegal'], ['ADMIN', 'roleAdmin'],
];

/**
 * Trang tổng quan dành cho quản trị viên (ROLE_ADMIN).
 *
 * Cách hoạt động: gọi `useAdminQuery(fetchAdminOverview, ...)` để lấy số liệu từ `GET /api/v1/admin/overview`
 * (qua `utils/adminService.js`), hiển thị 4 thẻ số liệu, phân bố vai trò và các thẻ truy cập nhanh
 * (người dùng, nhật ký, gói dịch vụ, hồ sơ cá nhân). Được `App.jsx` render khi vai trò hiện tại là ADMIN.
 *
 * @param {object} props
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ giao diện.
 * @param {string|null} [props.accessToken] JWT dùng để gọi API; null thì không gọi.
 * @param {boolean} [props.fetchOnMount=false] Có gọi API thật hay chỉ hiển thị trạng thái "API chưa sẵn sàng".
 * @param {Function|null} [props.onUnauthorized] Callback khi API trả 401 (đăng xuất/hết phiên).
 * @param {Function|null} [props.onOpenProfile] Mở trang hồ sơ cá nhân.
 * @param {Function|null} [props.onOpenSubscriptions] Mở trang quản lý gói dịch vụ.
 * @param {Function|null} [props.onNavigate] Điều hướng nội bộ admin (nhận 'users' hoặc 'logs').
 * @returns {JSX.Element} Giao diện tổng quan.
 */
export default function AdminHome({
  lang = 'vi', accessToken = null, fetchOnMount = false, onUnauthorized = null,
  onOpenProfile = null, onOpenSubscriptions = null, onNavigate = null,
}) {
  const t = adminI18n[lang] || adminI18n.vi;
  const en = lang === 'en';
  const { data, loading, apiPending, error, reload } = useAdminQuery(
    fetchAdminOverview, accessToken, { lang }, fetchOnMount, onUnauthorized, t.accessDenied
  );
  /**
   * Định dạng giá trị số liệu: "…" khi đang tải, "—" khi API chưa sẵn sàng, ngược lại là số hoặc chuỗi "không có".
   */
  const value = number => loading ? '…' : apiPending ? '—' : number ?? t.notAvailable;
  /**
   * Định dạng mốc thời gian của lần thu thập số liệu theo ngôn ngữ hiện tại; giá trị không hợp lệ trả nguyên chuỗi gốc.
   */
  const date = timestamp => {
    if (!timestamp) return t.notAvailable;
    const parsed = new Date(timestamp);
    return Number.isNaN(parsed.getTime()) ? timestamp : parsed.toLocaleString(en ? 'en-GB' : 'vi-VN', {
      dateStyle: 'medium', timeStyle: 'medium',
    });
  };
  /**
   * Các thẻ truy cập nhanh: [tiêu đề, mô tả, nhãn nút, handler khi bấm].
   */
  const actions = [
    [t.usersTitle, t.usersSubtitle, t.viewUsersBtn, () => onNavigate?.('users')],
    [t.logsTitle, t.logsSubtitle, t.viewLogsBtn, () => onNavigate?.('logs')],
    [t.subscriptionsCardTitle, t.subscriptionsCardDesc, t.manageSubscriptionsBtn, onOpenSubscriptions],
    [t.accountProfileCardTitle, t.accountProfileCardDesc, t.viewProfileBtn, onOpenProfile],
  ];

  return (
    <div className="lv-admin-container" aria-labelledby="admin-home-title">
      <header className="lv-admin-header">
        <h1 id="admin-home-title" className="lv-admin-header-title">{t.overviewTitle}</h1>
        <p className="lv-admin-header-subtitle">{t.overviewSubtitle}</p>
        <details className="lv-admin-snapshot">
          <summary>{t.statsAsOf} {loading ? t.loading : date(data?.completedAt)}</summary>
          <p>{date(data?.startedAt)} — {date(data?.completedAt)}.<br />
            {en ? 'Metrics may change during this collection interval.' : 'Số liệu có thể thay đổi trong khoảng thời gian thu thập này.'}</p>
        </details>
      </header>

      {apiPending && (
        <section className="lv-admin-pending-banner" role="status" aria-label="API Pending Notice">
          <div className="lv-admin-pending-banner-header">
            <span className="lv-admin-pending-banner-title">{en ? 'Overview information' : 'Thông tin tổng quan'}</span>
            <span className="lv-admin-pending-badge">{t.pendingApiBadge}</span>
          </div>
          <p className="lv-admin-pending-banner-desc">{t.overviewPendingNotice}</p>
          {fetchOnMount && <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={reload}>{t.retryBtn}</button>}
        </section>
      )}
      {error && !loading && (
        <section className="lv-admin-alert" role="alert">
          <h2 className="lv-admin-card-title">{t.errorHeading}</h2>
          <p>{error}</p>
          <button type="button" className="lv-admin-btn lv-admin-btn-secondary" onClick={reload}>{t.retryBtn}</button>
        </section>
      )}

      <section aria-labelledby="overview-metrics-heading">
        <h2 id="overview-metrics-heading" className="lv-admin-section-heading">{t.metricsHeading}</h2>
        <div className="lv-admin-overview-grid">
          {metrics.map(([key, Icon]) => (
            <div className="lv-admin-metric-card lv-surface-card" key={key}>
              <div className="lv-admin-metric-top">
                <div className="lv-admin-metric-label">{t[key]}</div>
                <span className="lv-admin-metric-icon"><Icon size={19} aria-hidden="true" /></span>
              </div>
              <div className="lv-admin-metric-value">{value(data?.[key])}</div>
            </div>
          ))}
        </div>
      </section>

      <div className="lv-admin-overview-panels">
        <section className="lv-admin-card-section lv-surface-card" aria-labelledby="role-distribution-title">
          <h2 id="role-distribution-title" className="lv-admin-card-title">{t.roleDistributionHeading}</h2>
          <p className="lv-admin-card-help">{t.roleDistributionHelp}</p>
          <div className="lv-admin-role-bars">
            {roles.map(([code, label]) => (
              <div className="lv-admin-role-row" key={code}>
                <span className="lv-admin-role-label">{t[label]}</span>
                <span className="lv-admin-role-count">{value(data?.roleDistribution?.[code])}</span>
              </div>
            ))}
          </div>
        </section>
        <section aria-labelledby="admin-shortcuts-title">
          <h2 id="admin-shortcuts-title" className="lv-admin-section-heading">{en ? 'Quick access' : 'Truy cập nhanh'}</h2>
          <div className="lv-admin-action-cards">
            {actions.map(([title, description, label, onClick], index) => (
              <div className="lv-admin-action-card lv-surface-card" key={title}>
                <h3 className="lv-admin-action-card-title">{title}</h3>
                <p className="lv-admin-action-card-desc">{description}</p>
                <button type="button" className={`lv-admin-btn lv-admin-btn-${index === 0 ? 'primary' : 'secondary'}`} onClick={onClick}>
                  {label}<ArrowUpRight size={15} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
      <details className="lv-admin-boundary">
        <summary>{en ? 'Administrator permissions' : 'Phạm vi quyền quản trị'}</summary>
        <p>{t.adminBoundaryWarning}</p>
      </details>
    </div>
  );
}
