import LanguageToggle from '../common/LanguageToggle.jsx';
import { useState, useEffect, useCallback, useRef } from 'react';
import MagneticButton from '../common/MagneticButton.jsx';
import {
  resolveAppShellAuthState,
  resolveUserRoleLabel,
  resolveAccountDisplayName,
  resolveAccountInitials,
} from '../../utils/accountProfileValidation.js';
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
    labelVi: 'Danh mục tài sản',
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
    labelVi: 'Người thụ hưởng & Người thi hành bên ngoài',
    labelEn: 'Beneficiaries & Trustees',
    status: 'ACTIVE',
  },
  {
    id: 'subscription',
    jiraTicket: 'CR-01',
    labelVi: 'Gói sử dụng',
    labelEn: 'Subscription Plans',
    status: 'ACTIVE',
  },
];

const STAFF_NAVIGATION_REGISTRY = [
  { id: 'cases', labelVi: 'Hồ sơ xác minh', labelEn: 'Verification Cases', status: 'ACTIVE' },
  {
    id: 'legal-documents',
    jiraTicket: 'PS-31',
    labelVi: 'Hồ sơ căn cứ pháp lý',
    labelEn: 'Legal Basis Documents',
    status: 'ACTIVE',
  },
  {
    id: 'asset-handover',
    jiraTicket: 'PS-53',
    labelVi: 'Bàn giao tài sản',
    labelEn: 'Asset Handover',
    status: 'ACTIVE',
  },
  { id: 'beneficiary-confirmation', jiraTicket: 'PS-54', labelVi: 'Xác nhận người thụ hưởng', labelEn: 'Beneficiary Confirmation', status: 'ACTIVE' },
  { id: 'completion-progress', jiraTicket: 'PS-55', labelVi: 'Tiến độ hoàn tất', labelEn: 'Completion Progress', status: 'ACTIVE' },
  { id: 'close-and-archive', jiraTicket: 'PS-56', labelVi: 'Đóng và lưu trữ hồ sơ', labelEn: 'Close & Archive', status: 'ACTIVE' },
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
  {
    id: 'dossier-review',
    jiraTicket: 'PS-32',
    labelVi: 'Thẩm định hồ sơ',
    labelEn: 'Dossier Review',
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
  session = null,
  isAuthenticated = undefined,
}) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [prevTab, setPrevTab] = useState(currentTab);
  const [prevMobileMenuOpen, setPrevMobileMenuOpen] = useState(mobileMenuOpen);
  const accountFooterRef = useRef(null);
  const badgeButtonRef = useRef(null);

  // Close account menu during render when currentTab or mobileMenuOpen changes
  if (currentTab !== prevTab) {
    setPrevTab(currentTab);
    setIsAccountMenuOpen(false);
  }
  if (mobileMenuOpen !== prevMobileMenuOpen) {
    setPrevMobileMenuOpen(mobileMenuOpen);
    if (!mobileMenuOpen) {
      setIsAccountMenuOpen(false);
    }
  }

  // Close mobile drawer on route change or resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth > 960) setMobileMenuOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close account popover menu when clicking outside or pressing Escape
  useEffect(() => {
    if (!isAccountMenuOpen) return;

    const handleClickOutside = (event) => {
      if (accountFooterRef.current && !accountFooterRef.current.contains(event.target)) {
        setIsAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsAccountMenuOpen(false);
        badgeButtonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAccountMenuOpen]);

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

  const isStaff = role === 'STAFF';
  const isLegal = role === 'LEGAL';
  const isBeneficiary = role === 'BENEFICIARY';
  const isAdmin = role === 'ADMIN';

  const content = {
    vi: {
      brandTag: isStaff
        ? 'Cổng Nhân viên Thực thi'
        : isLegal
          ? 'Cổng Thẩm định Pháp lý'
          : 'Hệ thống Quản lý Di sản Số',
      navSectionTitle: isStaff
        ? 'QUẢN TRỊ NGHIỆP VỤ'
        : isLegal
          ? 'THẨM ĐỊNH PHÁP LÝ'
          : 'QUẢN LÝ DI SẢN',
      breadcrumbHome: isStaff
        ? 'Cổng Nhân viên'
        : isLegal
          ? 'Cổng Pháp lý'
          : 'Bảng điều khiển',
      breadcrumbCurrent: isStaff
        ? (currentTab === 'close-and-archive' ? 'Đóng và lưu trữ hồ sơ' : currentTab === 'completion-progress' ? 'Tiến độ hoàn tất' : currentTab === 'beneficiary-confirmation' ? 'Xác nhận người thụ hưởng' : currentTab === 'asset-handover' ? 'Bàn giao tài sản' : currentTab === 'cases' ? 'Hồ sơ xác minh' : 'Hồ sơ căn cứ pháp lý')
        : isLegal
          ? 'Xác minh tử vong'
          : 'Kho di sản cá nhân',
      refreshTitle: 'Làm mới dữ liệu',
      roleBadge: isStaff
        ? 'Nhân viên thực thi'
        : isLegal
          ? 'Chuyên viên Pháp lý'
          : 'Chủ sở hữu kho',
      logout: 'Đăng xuất',
      accountCardAria: 'Tùy chọn tài khoản',
      accountMenuTitle: 'Menu tài khoản',
      accountProfile: 'Hồ sơ tài khoản',
      editProfile: 'Chỉnh sửa hồ sơ',
      neutralAccount: 'Tài khoản',
    },
    en: {
      brandTag: isStaff
        ? 'Staff Executor Portal'
        : isLegal
          ? 'Legal Verification Portal'
          : 'Digital Heritage Sanctuary',
      navSectionTitle: isStaff
        ? 'STAFF OPERATIONS'
        : isLegal
          ? 'LEGAL VERIFICATION'
          : 'HERITAGE PORTAL',
      breadcrumbHome: isStaff
        ? 'Staff Portal'
        : isLegal
          ? 'Legal Portal'
          : 'Dashboard',
      breadcrumbCurrent: isStaff
        ? (currentTab === 'close-and-archive' ? 'Close & Archive' : currentTab === 'completion-progress' ? 'Completion Progress' : currentTab === 'beneficiary-confirmation' ? 'Beneficiary Confirmation' : currentTab === 'asset-handover' ? 'Asset Handover' : currentTab === 'cases' ? 'Verification Cases' : 'Legal Basis Documents')
        : isLegal
          ? 'Death Verification'
          : 'Personal Heritage Vault',
      refreshTitle: 'Refresh records',
      roleBadge: isStaff
        ? 'Staff Executor'
        : isLegal
          ? 'Legal Verifier'
          : 'Vault Owner',
      logout: 'Sign out',
      accountCardAria: 'Account options',
      accountMenuTitle: 'Account menu',
      accountProfile: 'Account Profile',
      editProfile: 'Edit Profile',
      neutralAccount: 'Account',
    },
  };

  const t = content[lang] || content.vi;
  if (isAdmin) {
    t.brandTag = lang === 'en' ? 'Administrator account' : 'Tài khoản quản trị';
    t.navSectionTitle = lang === 'en' ? 'ADMINISTRATION' : 'QUẢN TRỊ';
    t.breadcrumbHome = lang === 'en' ? 'Administration' : 'Quản trị';
    t.breadcrumbCurrent = currentTab === 'admin-subscriptions' ? (lang === 'en' ? 'Subscription management' : 'Quản lý gói sử dụng') : (lang === 'en' ? 'Overview' : 'Tổng quan');
    t.roleBadge = lang === 'en' ? 'Administrator' : 'Quản trị viên';
  }
  if (isBeneficiary) {
    t.brandTag = lang === 'en' ? 'Beneficiary account' : 'Tài khoản người thụ hưởng';
    t.navSectionTitle = lang === 'en' ? 'BENEFICIARY' : 'NGƯỜI THỤ HƯỞNG';
    t.breadcrumbHome = lang === 'en' ? 'Beneficiary' : 'Người thụ hưởng';
    t.breadcrumbCurrent = lang === 'en' ? 'Account information' : 'Thông tin tài khoản';
    t.roleBadge = lang === 'en' ? 'Beneficiary' : 'Người thụ hưởng';
  }
  const navList = isAdmin
    ? [
        { id: 'admin-home', labelVi: 'Tổng quan quản trị', labelEn: 'Administration overview', status: 'ACTIVE' },
        { id: 'admin-subscriptions', labelVi: 'Quản lý gói sử dụng', labelEn: 'Subscription management', status: 'ACTIVE' },
      ]
    : isBeneficiary
    ? [{ id: 'beneficiary-home', labelVi: 'Thông tin thụ hưởng', labelEn: 'Beneficiary information', status: 'ACTIVE' }]
    : isStaff
    ? STAFF_NAVIGATION_REGISTRY
    : isLegal
      ? LEGAL_NAVIGATION_REGISTRY
      : NAVIGATION_REGISTRY;

  const hasSession = resolveAppShellAuthState({
    isAuthenticated,
    session,
    user,
    onLogout,
  });
  // Immediately clear user reference when there is no active session to prevent stale info
  const resolvedUser = hasSession ? (session?.user || user || null) : null;
  const displayRole = hasSession
    ? resolveUserRoleLabel(resolvedUser, session, role, lang)
    : null;
  const displayName = resolveAccountDisplayName(
    resolvedUser,
    session,
    hasSession,
    displayRole,
    lang
  );
  const displayInitials = hasSession
    ? (resolveAccountInitials(displayName) || (isStaff ? 'SE' : isLegal ? 'LV' : 'VO'))
    : '';

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
                    {item.id === 'subscription' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    ) : item.id === 'legal-documents' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <line x1="10" y1="9" x2="8" y2="9" />
                      </svg>
                    ) : item.id === 'beneficiary-confirmation' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <polyline points="16 11 18 13 22 9" />
                      </svg>
                    ) : item.id === 'completion-progress' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20V10" />
                        <path d="M18 20V4" />
                        <path d="M6 20v-4" />
                      </svg>
                    ) : item.id === 'close-and-archive' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                      </svg>
                    ) : item.id === 'death-verification' ? (
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
                    ) : item.id === 'dossier-review' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                        <polyline points="10 9 9 9 8 9" />
                      </svg>
                    ) : item.id === 'dms' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    ) : item.id === 'cases' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                        <path d="m9 14 2 2 4-4" />
                      </svg>
                    ) : item.id === 'asset-handover' ? (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
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

        {/* User Account Footer & Floating Popover Menu */}
        <div className="lv-sidebar-footer" ref={accountFooterRef}>
          {isAccountMenuOpen && (
            <div
              id="lv-account-popover-menu"
              className="lv-account-popover-menu"
              role="menu"
              aria-label={t.accountMenuTitle}
            >
              <div className="lv-account-popover-header" role="presentation">
                <div
                  className={`lv-account-popover-avatar ${!hasSession ? 'is-neutral' : ''}`}
                  aria-hidden="true"
                >
                  {hasSession ? (
                    displayInitials
                  ) : (
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <div className="lv-account-popover-user">
                  <span className="lv-account-popover-name">{displayName}</span>
                  {hasSession && displayRole && (
                    <span className="lv-account-popover-sub">{displayRole}</span>
                  )}
                </div>
              </div>

              <div className="lv-account-popover-divider" role="separator" />

              <ul className="lv-account-popover-list" role="none">
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`lv-account-menu-item ${currentTab === 'account-profile' ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      setMobileMenuOpen(false);
                      if (typeof onNavigateTab === 'function') {
                        onNavigateTab('account-profile');
                      }
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                    <span>{t.accountProfile}</span>
                    {currentTab === 'account-profile' && (
                      <span className="lv-menu-active-dot" aria-hidden="true" />
                    )}
                  </button>
                </li>

                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className={`lv-account-menu-item ${currentTab === 'account-edit' ? 'is-active' : ''}`}
                    onClick={() => {
                      setIsAccountMenuOpen(false);
                      setMobileMenuOpen(false);
                      if (typeof onNavigateTab === 'function') {
                        onNavigateTab('account-edit');
                      }
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M12 20h9" />
                      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                    </svg>
                    <span>{t.editProfile}</span>
                    {currentTab === 'account-edit' && (
                      <span className="lv-menu-active-dot" aria-hidden="true" />
                    )}
                  </button>
                </li>

                {hasSession && <li role="none"><a role="menuitem" className="lv-account-menu-item"
                  href={`/invitations?lang=${lang}`} style={{ textDecoration: 'none' }}>
                  {lang === 'en' ? 'Accept an invitation' : 'Nhận lời mời'}
                </a></li>}
                {hasSession && resolvedUser?.roles && (
                  <>
                    {!isBeneficiary && (resolvedUser.roles.includes('BENEFICIARY') || resolvedUser.roles.includes('ROLE_BENEFICIARY')) && (
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="lv-account-menu-item"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            setMobileMenuOpen(false);
                            if (typeof onNavigateTab === 'function') onNavigateTab('beneficiary-home');
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </svg>
                          <span>{lang === 'en' ? 'Beneficiary Portal' : 'Cổng Người thụ hưởng'}</span>
                        </button>
                      </li>
                    )}
                    {isBeneficiary && resolvedUser.roles.includes('VAULT_OWNER') && (
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="lv-account-menu-item"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            setMobileMenuOpen(false);
                            if (typeof onNavigateTab === 'function') onNavigateTab('vault');
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <rect x="3" y="3" width="18" height="18" rx="2" />
                            <path d="M7 7h10v10H7z" />
                          </svg>
                          <span>{lang === 'en' ? 'Heritage Vault' : 'Kho di sản'}</span>
                        </button>
                      </li>
                    )}
                    {isBeneficiary && resolvedUser.roles.includes('STAFF_EXECUTOR') && (
                      <li role="none">
                        <button
                          type="button"
                          role="menuitem"
                          className="lv-account-menu-item"
                          onClick={() => {
                            setIsAccountMenuOpen(false);
                            setMobileMenuOpen(false);
                            if (typeof onNavigateTab === 'function') onNavigateTab('cases');
                          }}
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                            <rect x="8" y="2" width="8" height="4" rx="1" />
                          </svg>
                          <span>{lang === 'en' ? 'Staff Portal' : 'Cổng Nhân viên'}</span>
                        </button>
                      </li>
                    )}
                  </>
                )}
                <li role="separator" className="lv-account-popover-divider" />
                <li role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="lv-account-menu-item lv-account-menu-item--logout"
                    disabled={!hasSession || typeof onLogout !== 'function'}
                    aria-disabled={!hasSession || typeof onLogout !== 'function'}
                    title={t.logout}
                    onClick={() => {
                      if (!hasSession || typeof onLogout !== 'function') {
                        return;
                      }
                      setIsAccountMenuOpen(false);
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>{t.logout}</span>
                  </button>
                </li>
              </ul>
            </div>
          )}

          <button
            ref={badgeButtonRef}
            type="button"
            className={`lv-user-badge-card ${isAccountMenuOpen ? 'is-menu-open' : ''} ${currentTab === 'account-profile' || currentTab === 'account-edit' ? 'is-active' : ''}`}
            onClick={() => setIsAccountMenuOpen((prev) => !prev)}
            aria-haspopup="menu"
            aria-expanded={isAccountMenuOpen}
            aria-controls="lv-account-popover-menu"
            aria-label={t.accountCardAria}
            title={t.accountCardAria}
          >
            <div
              className={`lv-user-avatar-initials ${!hasSession ? 'is-neutral' : ''}`}
              aria-hidden="true"
            >
              {hasSession ? (
                displayInitials
              ) : (
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              )}
            </div>
            <div className="lv-user-info">
              <span className="lv-user-name">{displayName}</span>
              {hasSession && displayRole && (
                <span className="lv-user-role">{displayRole}</span>
              )}
            </div>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`lv-user-card-chevron ${isAccountMenuOpen ? 'is-open' : ''}`}
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>
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
                {currentTab === 'account-profile'
                  ? (lang === 'en' ? 'Account Profile' : 'Hồ sơ tài khoản')
                  : currentTab === 'account-edit'
                  ? (lang === 'en' ? 'Edit Profile' : 'Chỉnh sửa hồ sơ')
                  : isStaff
                  ? currentTab === 'legal-documents'
                    ? (lang === 'en' ? 'Legal Basis Documents' : 'Hồ sơ căn cứ pháp lý')
                    : t.breadcrumbCurrent
                  : isLegal
                    ? currentTab === 'dossier-review'
                      ? (lang === 'en' ? 'Dossier Review' : 'Thẩm định hồ sơ')
                      : currentTab === 'basis-route-selection'
                        ? (lang === 'en' ? 'Basis Adjudication' : 'Thẩm định căn cứ')
                        : currentTab === 'will-document-verification'
                          ? (lang === 'en' ? 'Will Document Verification' : 'Đối chiếu di chúc')
                          : currentTab === 'death-verification'
                            ? (lang === 'en' ? 'Death Verification' : 'Xác minh tử vong')
                            : t.breadcrumbCurrent
                  : currentTab === 'subscription' ? (lang === 'en' ? 'Subscription Plans' : 'Gói sử dụng') : currentTab === 'beneficiaries'
                    ? (lang === 'en' ? 'Beneficiaries & Trustees' : 'Người thụ hưởng & Người thi hành bên ngoài')
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
            <LanguageToggle lang={lang} onToggleLang={onToggleLang} />
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
