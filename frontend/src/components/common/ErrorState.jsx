import { Button } from './Button.jsx';
import './ErrorState.css';

export default function ErrorState({
  error,
  onRetry,
  onNavigateToLogin,
  onCreateVault,
  lang = 'vi',
  title: customTitle,
  message: customMessage,
  actionLabel: customActionLabel,
  badge: customBadge,
}) {
  const status = error?.status || 0;

  // Configuration per HTTP status
  const errorConfigs = {
    401: {
      badgeVi: 'YÊU CẦU XÁC THỰC',
      badgeEn: 'AUTHENTICATION REQUIRED',
      titleVi: 'Phiên đăng nhập đã hết hạn',
      titleEn: 'Session has expired',
      descVi: 'Để bảo vệ tính toàn vẹn của dữ liệu di sản, vui lòng đăng nhập lại tài khoản của bạn.',
      descEn: 'To protect the security of your heritage records, please sign in to your account again.',
      actionType: 'login',
      actionLabelVi: 'Đăng nhập lại',
      actionLabelEn: 'Sign in again',
      icon: '🔒',
    },
    403: {
      badgeVi: 'GIỚI HẠN QUYỀN TRUY CẬP',
      badgeEn: 'ACCESS DENIED',
      titleVi: 'Không có quyền truy cập kho di sản',
      titleEn: 'Access restricted to vault owner',
      descVi: 'Kho di sản số này chỉ có thể được truy cập bởi chính chủ sở hữu tài khoản.',
      descEn: 'This heritage sanctuary is strictly restricted to its designated owner.',
      actionType: 'retry',
      actionLabelVi: 'Thử tải lại',
      actionLabelEn: 'Retry loading',
      icon: '⛔',
    },
    404: {
      badgeVi: 'KHÔNG TÌM THẤY DỮ LIỆU',
      badgeEn: 'VAULT NOT FOUND',
      titleVi: 'Không tìm thấy kho di sản',
      titleEn: 'Heritage vault not found',
      descVi: 'Kho di sản chưa được tìm thấy trên hệ thống. Bạn có thể tiến hành khởi tạo kho mới.',
      descEn: 'The requested vault could not be found. You may initialize a new heritage vault.',
      actionType: 'create',
      actionLabelVi: 'Khởi tạo kho mới',
      actionLabelEn: 'Initialize new vault',
      icon: '🔍',
    },
    default: {
      badgeVi: 'KẾT NỐI GIÁN ĐOẠN',
      badgeEn: 'CONNECTION INTERRUPTED',
      titleVi: 'Không thể tải thông tin kho di sản',
      titleEn: 'Unable to load vault details',
      descVi: 'Đã xảy ra sự cố khi kết nối đến máy chủ. Vui lòng kiểm tra đường truyền và thử lại.',
      descEn: 'A connection issue occurred while reaching the server. Please check your network and retry.',
      actionType: 'retry',
      actionLabelVi: 'Thử lại kết nối',
      actionLabelEn: 'Retry connection',
      icon: '⚠️',
    },
  };

  const cfg = errorConfigs[status] || errorConfigs.default;
  const badge = customBadge || (lang === 'en' ? cfg.badgeEn : cfg.badgeVi);
  const title = customTitle || (lang === 'en' ? cfg.titleEn : cfg.titleVi);
  const desc = customMessage || (lang === 'en' ? cfg.descEn : cfg.descVi);
  const configuredAction = cfg.actionType === 'login' ? onNavigateToLogin
    : cfg.actionType === 'create' ? onCreateVault : onRetry;
  const hasConfiguredAction = typeof configuredAction === 'function';
  const handleAction = hasConfiguredAction ? configuredAction
    : typeof onRetry === 'function' ? onRetry : null;
  const actionLabel = customActionLabel || (hasConfiguredAction
    ? (lang === 'en' ? cfg.actionLabelEn : cfg.actionLabelVi)
    : (lang === 'en' ? 'Retry' : 'Thử lại'));

  return (
    <section className="lv-error-state" role="alert">
      <div className="lv-error-card">
        <div className="lv-error-icon-wrap" aria-hidden="true">
          <span className="lv-error-icon">{cfg.icon}</span>
        </div>

        <span className="lv-error-badge">{badge}</span>
        <h2 className="lv-error-heading">{title}</h2>
        <p className="lv-error-desc">{desc}</p>

        {handleAction && <div className="lv-error-actions">
          <Button
            type="button"
            className="lv-error-primary-btn"
            onClick={handleAction}
          >
            {actionLabel}
          </Button>
          {!customActionLabel && hasConfiguredAction && cfg.actionType !== 'retry' && typeof onRetry === 'function' && (
            <Button
              variant="secondary"
              type="button"
              className="lv-error-secondary-btn"
              onClick={onRetry}
            >
              {lang === 'en' ? 'Retry' : 'Thử lại'}
            </Button>
          )}
        </div>}
      </div>
    </section>
  );
}
