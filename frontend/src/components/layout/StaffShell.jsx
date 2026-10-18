import { Globe, RefreshCw, LogOut, ShieldCheck, Sparkles } from 'lucide-react';
import './StaffShell.css';
import { getStaffCaseTranslations } from '../../pages/staff/staffCaseI18n.js';

/**
 * StaffShell — Khung giao diện chuyên biệt cho Nhân viên xác minh (STAFF_EXECUTOR)
 * Tách biệt hoàn toàn khỏi menu điều hướng của Owner để tuân thủ phân quyền và nghiệp vụ PS-25.
 */
export default function StaffShell({
  children,
  lang = 'vi',
  onToggleLang,
  onLogout,
  onRefresh,
  isRefreshing = false,
  isPreview = false,
  currentTab = null,
  onNavigateTab,
  onNavigateCases,
  onNavigateLegalDocuments,
  onNavigateAssetHandover,
  onNavigateCompletionProgress,
}) {
  const t = getStaffCaseTranslations(lang);

  return (
    <div className="lv-staff-shell">
      <header className="lv-staff-header" role="banner">
        <div className="lv-staff-header__inner">
          {/* Logo & Portal Identity */}
          <div className="lv-staff-header__brand-group">
            <div className="lv-staff-header__logo-wrap" aria-hidden="true">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="lv-staff-header__logo-icon"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>

            <div className="lv-staff-header__titles">
              <div className="lv-staff-header__brand-name">
                <span>LegacyVault</span>
                {isPreview && (
                  <span className="lv-staff-header__preview-tag" title="DEV Preview Mode">
                    <Sparkles size={11} aria-hidden="true" />
                    <span>Preview</span>
                  </span>
                )}
              </div>
              <div className="lv-staff-header__portal-title">
                {t.portalTitle}
              </div>
            </div>
          </div>

          {/* Role badge and Staff Utilities */}
          <div className="lv-staff-header__actions">
            <div className="lv-staff-header__role-pill" title={t.roleBadge}>
              <ShieldCheck size={14} className="lv-staff-header__role-icon" aria-hidden="true" />
              <span className="lv-staff-header__role-text">STAFF_EXECUTOR</span>
            </div>

            <button
              type="button"
              className="lv-staff-btn lv-staff-btn--icon"
              onClick={() => onToggleLang?.(lang === 'vi' ? 'en' : 'vi')}
              aria-label={lang === 'vi' ? 'Chuyển sang tiếng Anh' : 'Switch to Vietnamese'}
              title={lang === 'vi' ? 'English' : 'Tiếng Việt'}
            >
              <Globe size={16} aria-hidden="true" />
              <span className="lv-staff-btn__lang-label">{lang.toUpperCase()}</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                className={`lv-staff-btn lv-staff-btn--icon ${isRefreshing ? 'lv-staff-btn--spinning' : ''}`}
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label={isRefreshing ? t.refreshingBtn : t.refreshBtn}
                title={t.refreshBtn}
              >
                <RefreshCw size={16} aria-hidden="true" />
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                className="lv-staff-btn lv-staff-btn--logout"
                onClick={onLogout}
                aria-label={lang === 'en' ? 'Sign out' : 'Đăng xuất'}
                title={lang === 'en' ? 'Sign out' : 'Đăng xuất'}
              >
                <LogOut size={16} aria-hidden="true" />
                <span className="lv-staff-btn__text">{lang === 'en' ? 'Sign Out' : 'Đăng xuất'}</span>
              </button>
            )}
          </div>
        </div>
        <nav className="lv-staff-header__navigation" aria-label={lang === 'en' ? 'Staff navigation' : 'Điều hướng Staff'}>
          {(onNavigateCases || onNavigateTab) && (
            <button
              type="button"
              className={`lv-staff-btn ${currentTab === 'cases' ? 'lv-staff-btn--active' : ''}`}
              onClick={() => (onNavigateCases ? onNavigateCases() : onNavigateTab('cases'))}
              aria-current={currentTab === 'cases' ? 'page' : undefined}
            >
              {lang === 'en' ? 'Verification Cases' : 'Hồ sơ xác minh'}
            </button>
          )}
          {(onNavigateLegalDocuments || onNavigateTab) && (
            <button
              type="button"
              className={`lv-staff-btn ${currentTab === 'legal-documents' ? 'lv-staff-btn--active' : ''}`}
              onClick={() => (onNavigateLegalDocuments ? onNavigateLegalDocuments() : onNavigateTab('legal-documents'))}
              aria-current={currentTab === 'legal-documents' ? 'page' : undefined}
            >
              {lang === 'en' ? 'Legal Basis Documents' : 'Hồ sơ căn cứ pháp lý'}
            </button>
          )}
          {(onNavigateAssetHandover || onNavigateTab) && (
            <button
              type="button"
              className={`lv-staff-btn ${currentTab === 'asset-handover' ? 'lv-staff-btn--active' : ''}`}
              onClick={() => (onNavigateAssetHandover ? onNavigateAssetHandover() : onNavigateTab('asset-handover'))}
              aria-current={currentTab === 'asset-handover' ? 'page' : undefined}
            >
              {lang === 'en' ? 'Asset Handover' : 'Bàn giao tài sản'}
            </button>
          )}
          {onNavigateCompletionProgress && (
            <button type="button" className={`lv-staff-btn ${currentTab === 'completion-progress' ? 'lv-staff-btn--active' : ''}`}
              onClick={onNavigateCompletionProgress} aria-current={currentTab === 'completion-progress' ? 'page' : undefined}>
              {lang === 'en' ? 'Completion Progress' : 'Tiến độ hoàn tất'}
            </button>
          )}
        </nav>
      </header>

      {/* Main Workspace Container */}
      <main className="lv-staff-main" id="staff-main-content">
        <div className="lv-staff-container">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="lv-staff-footer" role="contentinfo">
        <div className="lv-staff-footer__inner">
          <p className="lv-staff-footer__copy">
            © {new Date().getFullYear()} LegacyVault. {lang === 'en' ? 'Staff Case Queue • Read-Only Reference Preview (PS-25).' : 'Cổng điều hành hồ sơ Staff • Khung xem trước thông tin tham chiếu (PS-25).'}
          </p>
          <p className="lv-staff-footer__security">
            {lang === 'en' ? 'Confidential — For Authorized Staff Only.' : 'Bảo mật — Chỉ dành cho nhân viên được phân quyền.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
