import { useState, useEffect, useCallback } from 'react';
import MagneticButton from '../common/MagneticButton.jsx';
import './AppShell.css';

/**
 * Extensible Navigation Registry for LegacyVault AppShell
 * Architecture notes:
 * - Supports modular routes conforming to role-based access control (RBAC).
 * - Routes are conditionally active only when their corresponding Jira capability has been implemented.
 * - Current active scope: PS-3 (Digital Heritage Vault).
 * - Future capability slots (Assets, Wills, Beneficiaries, DMS) are reserved at schema level but strictly not exposed in the UI.
 */
const NAVIGATION_REGISTRY = [
  {
    id: 'vault',
    jiraTicket: 'PS-3',
    labelVi: 'Kho di sản số',
    labelEn: 'Heritage Vault',
    status: 'ACTIVE',
  },
  {
    id: 'dms',
    jiraTicket: 'PS-4',
    labelVi: 'Giám sát hoạt động',
    labelEn: "Dead Man's Switch (DMS)",
    status: 'ACTIVE',
  },
  {
    id: 'assets',
    jiraTicket: 'PS-5',
    labelVi: 'Danh mục tài sản di sản',
    labelEn: 'Heritage Assets',
    status: 'ACTIVE',
  },
  {
    id: 'wills',
    jiraTicket: 'PS-7',
    labelVi: 'Hồ sơ di chúc số',
    labelEn: 'Digital Will Documents',
    status: 'ACTIVE',
  },
  {
    id: 'beneficiaries',
    jiraTicket: 'PS-8',
    labelVi: 'Người thụ hưởng & Người giám hộ',
    labelEn: 'Beneficiaries & Trustees',
    status: 'ACTIVE',
  },
];

const LEGAL_NAVIGATION_REGISTRY = [
  {
    id: 'death-verification',
    labelVi: 'Xác minh tử vong',
    labelEn: 'Death Verification',
    status: 'ACTIVE',
  },
  {
    id: 'will-document-verification',
    jiraTicket: 'PS-29',
    labelVi: 'Đối chiếu di chúc',
    labelEn: 'Will Verification',
    status: 'ACTIVE',
  },
  {
    id: 'basis-route-selection',
    jiraTicket: 'PS-30',
    labelVi: 'Thẩm định căn cứ',
    labelEn: 'Basis Adjudication',
    status: 'ACTIVE',
  },
];

export default function AppShell({
  children,
  currentTab = 'vault',
  onNavigateTab,
  onLogout,
  onRefresh,
  isRefreshing = false,
  lang = 'vi',
  onToggleLang,
  role = 'OWNER',
  user = null,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Close mobile drawer on route change or resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 960) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Cursor-reactive spotlight tracking for sidebar nav item
  const handleNavItemMouseMove = useCallback((e) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return;
    }
    const item = e.currentTarget;
    const rect = item.getBoundingClientRect();
    item.style.setProperty('--item-mouse-x', `${(e.clientX - rect.left).toFixed(1)}px`);
    item.style.setProperty('--item-mouse-y', `${(e.clientY - rect.top).toFixed(1)}px`);
    item.style.setProperty('--item-glow-opacity', '1');
  }, []);

  const handleNavItemMouseLeave = useCallback((e) => {
    const item = e.currentTarget;
    item.style.setProperty('--item-glow-opacity', '0');
  }, []);

  const isLegal = role === 'LEGAL';

  const content = {
    vi: {
      brandTag: isLegal ? 'Cổng Thẩm định Pháp lý' : 'Hệ thống Quản lý Di sản Số',
      navSectionTitle: isLegal ? 'THẨM ĐỊNH PHÁP LÝ' : 'QUẢN LÝ DI SẢN',
      breadcrumbHome: isLegal ? 'Cổng Pháp lý' : 'Bảng điều khiển',
      breadcrumbCurrent: isLegal ? 'Xác minh tử vong' : 'Kho di sản cá nhân',
      refreshTitle: 'Làm mới dữ liệu',
      roleBadge: isLegal ? 'Chuyên viên Pháp lý' : 'Chủ sở hữu kho',
      logout: 'Đăng xuất',
      userDisplay: isLegal
        ? (user?.fullName || user?.email || 'Chuyên viên Pháp lý')
        : (user?.fullName || 'Chủ sở hữu kho'),
      userInitials: isLegal
        ? (user?.fullName ? user.fullName.split(' ').map((s) => s[0]).join('').substring(0, 2).toUpperCase() : 'LV')
        : 'VO',
    },
    en: {
      brandTag: isLegal ? 'Legal Verification Portal' : 'Digital Heritage Sanctuary',
      navSectionTitle: isLegal ? 'LEGAL VERIFICATION' : 'HERITAGE PORTAL',
      breadcrumbHome: isLegal ? 'Legal Portal' : 'Dashboard',
      breadcrumbCurrent: isLegal ? 'Death Verification' : 'Personal Heritage Vault',
      refreshTitle: 'Refresh records',
      roleBadge: isLegal ? 'Legal Verifier' : 'Vault Owner',
      logout: 'Sign out',
      userDisplay: isLegal
        ? (user?.fullName || user?.email || 'Legal Verifier')
        : (user?.fullName || 'Vault Owner'),
      userInitials: isLegal
        ? (user?.fullName ? user.fullName.split(' ').map((s) => s[0]).join('').substring(0, 2).toUpperCase() : 'LV')
        : 'VO',
    },
  };

  const t = content[lang] || content.vi;
  const navList = isLegal ? LEGAL_NAVIGATION_REGISTRY : NAVIGATION_REGISTRY;

  return (
    <div className="lv-shell">
      {/* ====================================================================
          SIDEBAR REGION (Desktop 260px / Mobile Drawer)
          ==================================================================== */}
      {mobileMenuOpen && (
        <div
          className="lv-shell-drawer-overlay"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={`lv-shell-sidebar ${mobileMenuOpen ? 'is-open' : ''}`}
        aria-label="Điều hướng chính"
      >
        {/* Brand Header */}
        <div className="lv-sidebar-brand">
          <div className="lv-brand-logo-wrap" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
          </div>
          <div className="lv-brand-titles">
            <span className="lv-brand-name">LegacyVault</span>
            <span className="lv-brand-sub">{t.brandTag}</span>
          </div>
          {mobileMenuOpen && (
            <button
              type="button"
              className="lv-drawer-close-btn"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Đóng menu"
            >
              ✕
            </button>
          )}
        </div>

        {/* Navigation Items — Extensible modular rendering strictly for ACTIVE routes */}
        <nav className="lv-sidebar-nav" aria-label="Menu chức năng">
          <span className="lv-nav-heading">{t.navSectionTitle}</span>
          <ul className="lv-nav-list">
            {navList.filter((item) => item.status === 'ACTIVE').map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className={`lv-nav-item ${currentTab === item.id ? 'is-active' : ''}`}
                  onClick={() => {
                    if (typeof onNavigateTab === 'function') onNavigateTab(item.id);
                    setMobileMenuOpen(false);
                  }}
                  onMouseMove={handleNavItemMouseMove}
                  onMouseLeave={handleNavItemMouseLeave}
                  aria-current={currentTab === item.id ? 'page' : undefined}
                >
                  <span className="lv-nav-spotlight" aria-hidden="true" />
                  <span className="lv-nav-icon" aria-hidden="true">
                    {item.id === 'death-verification' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                        <path d="M9 12l2 2 4-4" />
                      </svg>
                    ) : item.id === 'will-document-verification' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <path d="M9 15l2 2 4-4" />
                      </svg>
                    ) : item.id === 'basis-route-selection' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
                        <path d="M2 16l3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1z" />
                        <path d="M7 21h10" />
                        <path d="M12 3v18" />
                        <path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2" />
                      </svg>
                    ) : item.id === 'dms' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="4" />
                        <circle cx="12" cy="12" r="3" />
                        <line x1="12" y1="3" x2="12" y2="6" />
                        <line x1="12" y1="18" x2="12" y2="21" />
                      </svg>
                    )}
                  </span>
                  <span className="lv-nav-label">
                    {lang === 'vi' ? item.labelVi : item.labelEn}
                  </span>
                  {currentTab === item.id && (
                    <span className="lv-nav-active-pip" aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        {/* User Role Footer - Hidden when unauthenticated for legal to avoid impersonation */}
        {(!isLegal || Boolean(user)) && (
          <div className="lv-sidebar-footer">
            <div className="lv-user-badge-card">
              <div className="lv-user-avatar-initials" aria-hidden="true">
                {t.userInitials}
              </div>
              <div className="lv-user-info">
                <span className="lv-user-name">{t.userDisplay}</span>
                <span className="lv-user-role">{t.roleBadge}</span>
              </div>
            </div>
            {typeof onLogout === 'function' && (
              <MagneticButton
                type="button"
                className="lv-sidebar-logout-btn"
                onClick={onLogout}
                maxOffset={4}
              >
                <span aria-hidden="true">↳</span>
                <span>{t.logout}</span>
              </MagneticButton>
            )}
          </div>
        )}
      </aside>

      {/* ====================================================================
          MAIN APP CANVAS (Header + Content)
          ==================================================================== */}
      <div className="lv-shell-main-wrap">
        {/* Top Header Bar */}
        <header className="lv-shell-header">
          <div className="lv-header-left">
            <button
              type="button"
              className="lv-mobile-menu-trigger"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Mở menu điều hướng"
              aria-expanded={mobileMenuOpen}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>

            {/* Breadcrumb Hierarchy */}
            <nav className="lv-header-breadcrumbs" aria-label="Đường dẫn trang">
              <span className="lv-crumb-dim">{t.breadcrumbHome}</span>
              <span className="lv-crumb-sep" aria-hidden="true">/</span>
              <span className="lv-crumb-active">
                {isLegal
                  ? currentTab === 'basis-route-selection'
                    ? (lang === 'en' ? 'Basis Adjudication' : 'Thẩm định căn cứ')
                    : currentTab === 'will-document-verification'
                      ? (lang === 'en' ? 'Will Document Verification' : 'Đối chiếu di chúc')
                      : currentTab === 'death-verification'
                        ? (lang === 'en' ? 'Death Verification' : 'Xác minh tử vong')
                        : t.breadcrumbCurrent
                  : currentTab === 'beneficiaries'
                    ? (lang === 'en' ? 'Beneficiaries & Trustees' : 'Người thụ hưởng & Người giám hộ')
                    : currentTab === 'wills'
                      ? (lang === 'en' ? 'Digital Will Documents' : 'Hồ sơ di chúc số')
                      : currentTab === 'assets'
                        ? (lang === 'en' ? 'Heritage Assets' : 'Danh mục tài sản')
                        : currentTab === 'dms'
                          ? (lang === 'en' ? "Dead Man's Switch" : 'Giám sát hoạt động')
                          : t.breadcrumbCurrent}
              </span>
            </nav>
          </div>

          {/* Right Header Utilities: Refresh, Language Switcher */}
          <div className="lv-header-right">
            {typeof onRefresh === 'function' && (
              <MagneticButton
                type="button"
                className={`lv-header-action-btn ${isRefreshing ? 'is-spinning' : ''}`}
                onClick={onRefresh}
                title={t.refreshTitle}
                aria-label={t.refreshTitle}
                disabled={isRefreshing}
                maxOffset={3}
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 4v6h-6" />
                  <path d="M1 20v-6h6" />
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                </svg>
              </MagneticButton>
            )}

            {/* Language Toggle Pill */}
            <div className="lv-shell-lang-toggle" role="group" aria-label="Ngôn ngữ / Language">
              <button
                type="button"
                className={`lv-lang-btn ${lang === 'vi' ? 'is-active' : ''}`}
                onClick={() => onToggleLang && onToggleLang('vi')}
                aria-pressed={lang === 'vi'}
              >
                VI
              </button>
              <button
                type="button"
                className={`lv-lang-btn ${lang === 'en' ? 'is-active' : ''}`}
                onClick={() => onToggleLang && onToggleLang('en')}
                aria-pressed={lang === 'en'}
              >
                EN
              </button>
            </div>
          </div>
        </header>

        {/* Scrollable Content Container */}
        <main id="main-content" className="lv-shell-content">
          {children}
        </main>
      </div>
    </div>
  );
}
