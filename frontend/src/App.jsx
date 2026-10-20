import BeneficiaryHome from './pages/beneficiary/BeneficiaryHome.jsx';
import AdminHome from './pages/admin/AdminHome.jsx';
import AdminSubscriptionPage from './pages/admin/AdminSubscriptionPage.jsx';
import { previewRoute } from './utils/previewState.js';
import { useState, useEffect, useCallback, useRef } from 'react';
import RegisterPageHenedo from './pages/auth/RegisterPageHenedo.jsx';
import LandingPage from './pages/landing/LandingPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import VaultOverviewPage from './pages/vault/VaultOverviewPage.jsx';
import DMSOverviewPage from './pages/dms/DMSOverviewPage.jsx';
import { request, ApiError } from './api/http.js';
import { readUser } from './api/contracts.js';
import { createSession, isSessionActive, readStoredSession, storeSession } from './utils/session.js';
import AssetsRoute from './pages/assets/AssetsRoute.jsx';
import WillsRoute from './pages/wills/WillsRoute.jsx';
import TrusteeBeneficiaryRoute from './pages/trusteeBeneficiary/TrusteeBeneficiaryRoute.jsx';
import SubscriptionPage from './pages/subscription/SubscriptionPage.jsx';
import LegalDossierReviewPage from './pages/legal/LegalDossierReviewPage.jsx';
import LegalApprovalReviewPage from './pages/legal/LegalApprovalReviewPage.jsx';
import { canAccessLegalDossierReview } from './utils/legalDossierReviewValidation.js';
import StaffLegalDocumentsPage from './pages/staff/StaffLegalDocumentsPage.jsx';
import BeneficiaryAccountPage from './pages/staff/BeneficiaryAccountPage.jsx';
import { canAccessStaffLegalDocuments, resolvePostLoginRoute } from './utils/staffLegalDocumentsValidation.js';
import ScopedAssetHandoverPage from './pages/staff/ScopedAssetHandoverPage.jsx';
import { canAccessScopedAssetHandover } from './utils/scopedAssetHandoverValidation.js';
import BeneficiaryConfirmationPage from './pages/staff/BeneficiaryConfirmationPage.jsx';
import { canAccessBeneficiaryConfirmation } from './utils/beneficiaryConfirmationValidation.js';
import CompletionProgressPage from './pages/staff/CompletionProgressPage.jsx';
import { canAccessCompletionProgress } from './utils/completionProgressValidation.js';
import CloseAndArchivePage from './pages/staff/CloseAndArchivePage.jsx';
import { canAccessCloseArchive } from './utils/closeAndArchiveValidation.js';
import AppShell from './components/layout/AppShell.jsx';
import StaffShell from './components/layout/StaffShell.jsx';
import StaffCaseDashboard from './pages/staff/StaffCaseDashboard.jsx';
import CounterHandoverPage from './pages/staff/CounterHandoverPage.jsx';
import LegalDeathVerificationPage from './pages/legal/LegalDeathVerificationPage.jsx';
import ControlledUnlockPage from './pages/legal/ControlledUnlockPage.jsx';
import { canAccessLegalDeathVerification } from './utils/legalDeathVerificationValidation.js';
import LegalWillDocumentVerificationPage from './pages/legal/LegalWillDocumentVerificationPage.jsx';
import { canAccessLegalWillVerification } from './utils/legalWillVerificationValidation.js';
import LegalBasisRouteSelectionPage from './pages/legal/LegalBasisRouteSelectionPage.jsx';
import { canAccessLegalBasisRoute } from './utils/legalBasisRouteValidation.js';
import AccountProfilePage from './pages/account/AccountProfilePage.jsx';
import { canAccessAccountProfile } from './utils/accountProfileValidation.js';
import AccountEditPage from './pages/account/AccountEditPage.jsx';
import { canAccessAccountEdit } from './utils/accountEditValidation.js';


function NotFoundFallback({ onNavigateToRegister, onNavigateToLogin }) {
  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        backgroundColor: '#f7f5f0',
        padding: '24px',
        textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#1f2421',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '44px 32px',
          boxShadow: '0 4px 20px rgba(22, 70, 57, 0.05)',
          border: '1px solid #eae5dc',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'rgba(197, 160, 89, 0.12)',
            color: '#c5a059',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '22px',
            fontWeight: 700,
          }}
          aria-hidden="true"
        >
          404
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px',
            color: '#164639',
            margin: '0 0 12px',
            fontWeight: 600,
          }}
        >
          Không tìm thấy trang
        </h1>

        <p
          style={{
            fontSize: '14.5px',
            color: '#6b726b',
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}
        >
          Đường dẫn bạn yêu cầu không tồn tại hoặc chưa được kích hoạt trong hệ thống.
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onNavigateToRegister}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#c5a059',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            <span>Về trang Đăng ký</span>
            <span aria-hidden="true">→</span>
          </button>
          <button
            type="button"
            onClick={onNavigateToLogin}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              backgroundColor: '#f1ede4',
              color: '#164639',
              fontWeight: 600,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '10px',
              border: '1px solid #ded9ce',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            <span>Đến trang Đăng nhập</span>
          </button>
        </div>
      </div>
    </main>
  );
}

function StaffAccessDeniedFallback({ lang, onLogout }) {
  const isEn = lang === 'en';
  return (
    <main
      role="alert"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100svh',
        backgroundColor: '#f7f5f0',
        padding: '24px',
        textAlign: 'center',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#1f2421',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '44px 32px',
          boxShadow: '0 4px 20px rgba(22, 70, 57, 0.05)',
          border: '1px solid #eae5dc',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'rgba(179, 38, 30, 0.1)',
            color: '#b3261e',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '22px',
            fontWeight: 700,
          }}
          aria-hidden="true"
        >
          403
        </div>
        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '22px',
            color: '#164639',
            margin: '0 0 12px',
            fontWeight: 600,
          }}
        >
          {isEn ? 'Access restricted' : 'Từ chối quyền truy cập'}
        </h1>
        <p
          style={{
            fontSize: '14.5px',
            color: '#6b726b',
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}
        >
          {isEn
            ? 'This section requires a Staff Executor account (STAFF_EXECUTOR).'
            : 'Khu vực này yêu cầu tài khoản nhân viên xử lý hồ sơ (STAFF_EXECUTOR).'}
        </p>
        <button
          type="button"
          onClick={onLogout}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            backgroundColor: '#164639',
            color: '#ffffff',
            fontWeight: 600,
            fontSize: '14px',
            padding: '12px 24px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          {isEn ? 'Sign in with another account' : 'Đăng nhập tài khoản khác'}
        </button>
      </div>
    </main>
  );
}

function LegalAccessDeniedFallback({ lang, onLogout, onNavigateToVault, canReturnToVault }) {
  const isEn = lang === 'en';
  return (
    <main
      role="alert"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#faf8f5',
        padding: '24px',
        fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
        color: '#1f2421',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          maxWidth: '480px',
          width: '100%',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          padding: '44px 32px',
          boxShadow: '0 4px 20px rgba(22, 70, 57, 0.05)',
          border: '1px solid #eae5dc',
        }}
      >
        <div
          style={{
            width: '52px',
            height: '52px',
            borderRadius: '50%',
            backgroundColor: 'rgba(180, 35, 24, 0.1)',
            color: '#b42318',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 20px',
            fontSize: '20px',
            fontWeight: 700,
          }}
          aria-hidden="true"
        >
          403
        </div>

        <h1
          style={{
            fontFamily: "'Playfair Display', Georgia, serif",
            fontSize: '24px',
            color: '#164639',
            margin: '0 0 12px',
            fontWeight: 600,
          }}
        >
          {isEn ? 'Access Denied' : 'Từ chối truy cập'}
        </h1>

        <p
          style={{
            fontSize: '14px',
            color: '#6b726b',
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}
        >
          {isEn
            ? 'This page is restricted to Legal Verifiers (LEGAL_VERIFIER). Client guard does not replace backend authorization.'
            : 'Trang này chỉ dành cho tài khoản Chuyên viên Pháp lý (LEGAL_VERIFIER). Guard phía máy khách không thay thế phân quyền của máy chủ.'}
        </p>

        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={onLogout}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#164639',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '14px',
              padding: '12px 24px',
              borderRadius: '10px',
              border: 'none',
              cursor: 'pointer',
              transition: 'background-color 0.2s ease',
            }}
          >
            <span>{isEn ? 'Sign in with another account' : 'Đăng nhập tài khoản khác'}</span>
          </button>
          {canReturnToVault && (
            <button
              type="button"
              onClick={onNavigateToVault}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: '#f1ede4',
                color: '#164639',
                fontWeight: 600,
                fontSize: '14px',
                padding: '12px 24px',
                borderRadius: '10px',
                border: '1px solid #ded9ce',
                cursor: 'pointer',
                transition: 'background-color 0.2s ease',
              }}
            >
              <span>{isEn ? 'Back to Vault' : 'Về Kho di sản'}</span>
            </button>
          )}
        </div>
      </div>
    </main>
  );
}

export default function App() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [lang, setLang] = useState(() => (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'vi'));
  const [session, setSession] = useState(readStoredSession);
  const [restoreStatus, setRestoreStatus] = useState(() => readStoredSession() ? 'loading' : 'ready');
  const [restoreAttempt, setRestoreAttempt] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditFormDirty, setIsEditFormDirty] = useState(false);
  const [pendingNavigationTarget, setPendingNavigationTarget] = useState(null);
  const isEditFormDirtyRef = useRef(false);
  const locationRef = useRef(location);
  const historyIndexRef = useRef(0);
  const isRevertingPopStateRef = useRef(false);
  const restoreControllerRef = useRef(null);

  useEffect(() => {
    isEditFormDirtyRef.current = isEditFormDirty;
  }, [isEditFormDirty]);
  useEffect(() => {
    locationRef.current = location;
  }, [location]);

  useEffect(() => {
    const state = window.history.state;
    if (!state || typeof state.lvIdx !== 'number') {
      window.history.replaceState({ ...(state || {}), lvIdx: 0 }, '');
      historyIndexRef.current = 0;
    } else {
      historyIndexRef.current = state.lvIdx;
    }
  }, []);

  const navigateTo = useCallback(path => {
    const nextIdx = (historyIndexRef.current || 0) + 1;
    historyIndexRef.current = nextIdx;
    window.history.pushState({ lvIdx: nextIdx }, '', path);
    setLocation(path);
  }, []);

  const logout = useCallback(() => {
    restoreControllerRef.current?.abort();
    storeSession(null);
    setRestoreStatus('ready');
    isEditFormDirtyRef.current = false;
    setIsEditFormDirty(false);
    setPendingNavigationTarget(null);
    setSession(null);
    navigateTo('/login');
  }, [navigateTo]);

  useEffect(() => {
    const candidate = readStoredSession();
    if (!candidate) return;
    const controller = new AbortController();
    restoreControllerRef.current = controller;
    request('/auth/me', { accessToken: candidate.accessToken, signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        const user = readUser(result);
        if (!isSessionActive(candidate) || user.id !== candidate.user.id) { logout(); return; }
        setSession({ ...candidate, user });
        setRestoreStatus('ready');
      })
      .catch(error => {
        if (controller.signal.aborted) return;
        if (error.status === 401 || error.code === 'INVALID_AUTH_RESPONSE') logout();
        else setRestoreStatus('error');
      });
    return () => controller.abort();
  }, [logout, restoreAttempt]);

  useEffect(() => { storeSession(session); }, [session]);

  useEffect(() => {
    const handlePopState = (event) => {
      if (isRevertingPopStateRef.current) {
        isRevertingPopStateRef.current = false;
        return;
      }

      const targetIdx = event.state?.lvIdx;
      const currentIdx = historyIndexRef.current;
      const delta = typeof targetIdx === 'number' ? targetIdx - currentIdx : -1;
      const targetPath = window.location.pathname + window.location.search;

      if (isEditFormDirtyRef.current) {
        // Revert history pointer without pushing new entry to preserve forward/back stacks
        isRevertingPopStateRef.current = true;
        if (delta !== 0) {
          window.history.go(-delta);
        }
        setPendingNavigationTarget({ type: 'POPSTATE', delta, targetPath });
        return;
      }

      if (typeof targetIdx === 'number') {
        historyIndexRef.current = targetIdx;
      }
      setLocation(targetPath);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  useEffect(() => {
    if (!session) return;
    let timer;
    const schedule = () => {
      const remaining = session.expiresAt - Date.now();
      if (remaining <= 0) { logout(); return; }
      timer = setTimeout(schedule, Math.min(remaining, 2147483647));
    };
    schedule();
    return () => clearTimeout(timer);
  }, [session, logout]);
  const establishSession = async (result, options) => {
    const candidate = createSession(result);
    const user = readUser(await request('/auth/me', { ...options, accessToken: candidate.accessToken }));
    if (options.signal?.aborted) return;
    if (user.id !== candidate.user.id) throw new ApiError('INVALID_AUTH_RESPONSE');
    setSession({ ...candidate, user }); setLang(options.lang || 'vi');
    navigateTo(user.roles?.includes('STAFF_EXECUTOR') && !user.roles?.includes('VAULT_OWNER') && !user.roles?.includes('LEGAL_VERIFIER') ? '/staff/cases' : resolvePostLoginRoute(user));
  };
  const handleRefresh = async () => {
    setIsRefreshing(true); setRefreshTrigger(value => value + 1);
    setIsRefreshing(false);
  };
  const path = location.split('?')[0];
  if (restoreStatus !== 'ready') return (
    <main role={restoreStatus === 'error' ? 'alert' : 'status'}>
      <p>{restoreStatus === 'error'
        ? (lang === 'en' ? 'Unable to verify your session. Please retry.' : 'Chưa thể xác minh phiên đăng nhập. Vui lòng thử lại.')
        : (lang === 'en' ? 'Restoring your session…' : 'Đang khôi phục phiên đăng nhập…')}</p>
      {restoreStatus === 'error' && <>
        <button onClick={() => { if (!readStoredSession()) { logout(); return; } setRestoreStatus('loading'); setRestoreAttempt(value => value + 1); }}>{lang === 'en' ? 'Retry' : 'Thử lại'}</button>
        <button onClick={logout}>{lang === 'en' ? 'Sign out' : 'Đăng xuất'}</button>
      </>}
    </main>
  );
  const preview = Boolean(import.meta.env.DEV && !session && new URLSearchParams(location.split('?')[1] || '').get('preview') === 'true');
  if (path === '/admin' || path === '/admin/subscriptions') {
    if (!isSessionActive(session)) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!session.user.roles.includes('ADMIN')) return <main role="alert"><p>{lang === 'en' ? 'This page requires an administrator account.' : 'Trang này dành cho tài khoản quản trị viên.'}</p><button onClick={logout}>{lang === 'en' ? 'Sign out' : 'Đăng xuất'}</button></main>;
    const currentTab = path === '/admin/subscriptions' ? 'admin-subscriptions' : 'admin-home';
    return <AppShell role="ADMIN" session={session} user={session.user} lang={lang} currentTab={currentTab}
      isAuthenticated={isSessionActive(session)} onToggleLang={setLang} onLogout={isSessionActive(session) ? logout : null}
      onNavigateTab={tab => navigateTo(tab === 'account-profile' ? '/account/profile' : tab === 'account-edit' ? '/account/edit' : tab === 'admin-subscriptions' ? '/admin/subscriptions' : '/admin')}>
      {currentTab === 'admin-subscriptions'
        ? <AdminSubscriptionPage lang={lang} accessToken={session?.token || session?.accessToken} onUnauthorized={logout} onNavigateHome={() => navigateTo('/admin')} />
        : <AdminHome lang={lang} onOpenProfile={() => navigateTo('/account/profile')} onOpenSubscriptions={() => navigateTo('/admin/subscriptions')} />}
    </AppShell>;
  }
  if (path === '/beneficiary') {
    if (!isSessionActive(session)) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!session.user.roles.includes('BENEFICIARY')) return <main role="alert"><p>{lang === 'en' ? 'This page requires a beneficiary account.' : 'Trang này dành cho tài khoản người thụ hưởng.'}</p><button onClick={logout}>{lang === 'en' ? 'Sign out' : 'Đăng xuất'}</button></main>;
    return <AppShell role="BENEFICIARY" session={session} user={session.user} lang={lang} currentTab="beneficiary-home"
      isAuthenticated={isSessionActive(session)} onToggleLang={setLang} onLogout={isSessionActive(session) ? logout : null} onNavigateTab={tab => navigateTo(tab === 'account-profile' ? '/account/profile' : tab === 'account-edit' ? '/account/edit' : '/beneficiary')}>
      <BeneficiaryHome lang={lang} onOpenProfile={() => navigateTo('/account/profile')} />
    </AppShell>;
  }
  const resolveAccountRoute = (basePath) => {
    const params = new URLSearchParams();
    if (preview) params.set('preview', 'true');
    if (lang === 'en') params.set('lang', 'en');
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ''}`;
  };

  if (path === '/staff/handover') {
    if (!isSessionActive(session) && !preview) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!preview && !session?.user?.roles?.includes('STAFF_EXECUTOR')) return <main role="alert"><p>{lang === 'en' ? 'Access denied.' : 'Bạn không có quyền truy cập.'}</p><button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    return <div className="lv-app-root"><CounterHandoverPage key={session?.user.id || 'preview'} accessToken={session?.accessToken} isDevPreview={preview} lang={lang} onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} /></div>;
  }
  const isStaffRoute = path === '/staff/cases';
  if (isStaffRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !session.user.roles.includes('STAFF_EXECUTOR')) {
      return (
        <main role="alert" style={{ minHeight: '100svh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', textAlign: 'center', fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif", backgroundColor: '#f7f5f0' }}>
          <p style={{ fontSize: '16px', color: '#164639', fontWeight: 600, marginBottom: '16px' }}>
            {lang === 'en' ? 'This portal requires a Staff Executor account.' : 'Cổng này chỉ dành cho tài khoản Nhân viên xử lý (STAFF_EXECUTOR).'}
          </p>
          <button
            type="button"
            onClick={logout}
            style={{ padding: '10px 20px', borderRadius: '8px', backgroundColor: '#164639', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600 }}
          >
            {lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}
          </button>
        </main>
      );
    }
    const staffContext = {
      accessToken: session?.accessToken,
      onUnauthorized: logout,
      lang,
      onNavigateToLogin: logout,
      onRefreshTrigger: refreshTrigger,
    };
    return (
      <div className="lv-app-root">
        <StaffShell session={session} user={session?.user || null} onNavigateProfile={() => navigateTo(resolveAccountRoute('/account/profile'))} onNavigateAccountEdit={() => navigateTo(resolveAccountRoute('/account/edit'))}
          lang={lang}
          onToggleLang={setLang}
          onLogout={logout}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          isPreview={preview}
          currentTab="cases"
          onNavigateCases={() => navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases')}
          onNavigateLegalDocuments={() => navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents')}
          onNavigateAssetHandover={() => navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover')}
          onNavigateCloseAndArchive={() => navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive')}
          onNavigateCompletionProgress={() => navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress')}
          onNavigateBeneficiaryConfirmation={() => navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation')}
        >
          <StaffCaseDashboard
            key={session?.user.id || 'preview'}
            {...staffContext}
            isDevPreview={preview}
          />
        </StaffShell>
      </div>
    );
  }

  const isLegalDossierReviewRoute = path === '/legal/dossier-review';
  if (path === '/legal/approval-review') {
    if (!isSessionActive(session) && !preview) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!preview && !session?.user?.roles?.includes('LEGAL_VERIFIER')) return <main role="alert"><p>{lang === 'en' ? 'This portal requires a Legal Verifier account.' : 'Cổng này chỉ dành cho tài khoản Thẩm định Pháp lý (LEGAL_VERIFIER).'}</p><button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    return <div className="lv-app-root"><LegalApprovalReviewPage key={session?.user.id || 'preview'} accessToken={session?.accessToken} isDevPreview={preview} lang={lang} onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} /></div>;
  }
  if (isLegalDossierReviewRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessLegalDossierReview(session)) {
      return (
        <div className="lv-app-root">
          <LegalAccessDeniedFallback
            lang={lang}
            onLogout={logout}
            onNavigateToVault={() => navigateTo('/vault')}
            canReturnToVault={Boolean(session?.user?.roles?.includes('VAULT_OWNER'))}
          />
        </div>
      );
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="LEGAL"
          currentTab="dossier-review"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <LegalDossierReviewPage
            lang={lang}
            preview={preview}
            session={session}
          />
        </AppShell>
      </div>
    );
  }
  const isVaultRoute = path === '/vault' || path === '/vaults';
  const isDmsRoute = path === '/dms';
  const isAssetsRoute = path === '/assets';
  const isWillsRoute = path === '/wills';
  const isBeneficiariesRoute = path === '/beneficiaries';
  const isSubscriptionRoute = path === '/subscription' || path === '/subscriptions';
  const isStaffLegalDocsRoute = path === '/staff/legal-documents';
  const isAccountProfileRoute = path === '/account/profile';
  const isAccountEditRoute = path === '/account/edit';
  const isStaffBeneficiaryConfirmationRoute = path === '/staff/beneficiary-confirmation';
  const isStaffCompletionProgressRoute = path === '/staff/completion-progress';
  const isStaffCloseArchiveRoute = path === '/staff/close-and-archive';
  const isStaffAssetHandoverRoute = path === '/staff/asset-handover';
  const isLegalDeathRoute = path === '/legal' || path === '/legal/death-verification';
  const isLegalWillRoute = path === '/legal/will-document-verification';
  const isLegalBasisRoute = path === '/legal/basis-route-selection';

  const handleExecuteNavigation = (targetTab) => {
    if (targetTab === 'admin-home') { navigateTo('/admin');
    } else if (targetTab === 'admin-subscriptions') { navigateTo('/admin/subscriptions');
    } else if (targetTab === 'beneficiary-home') { navigateTo('/beneficiary');
    } else if (targetTab === 'account-profile') {
      navigateTo(resolveAccountRoute('/account/profile'));
    } else if (targetTab === 'account-edit') {
      navigateTo(resolveAccountRoute('/account/edit'));
    } else if (targetTab === 'cases') {
      navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
    } else if (targetTab === 'legal-documents') {
      navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
    } else if (targetTab === 'asset-handover') {
      navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
    } else if (targetTab === 'beneficiary-confirmation') {
      navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
    } else if (targetTab === 'completion-progress') {
      navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
    } else if (targetTab === 'close-and-archive') {
      navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
    } else if (targetTab === 'death-verification') {
      navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
    } else if (targetTab === 'will-document-verification') {
      navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
    } else if (targetTab === 'basis-route-selection') {
      navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
    } else if (targetTab === 'dossier-review') {
      navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
    } else if (targetTab === 'approval-review') {
      navigateTo(preview ? '/legal/approval-review?preview=true' : '/legal/approval-review');
    } else if (targetTab === 'controlled-unlock') {
      navigateTo(preview ? '/legal/controlled-unlock?preview=true' : '/legal/controlled-unlock');
    } else if (targetTab === 'subscription') {
      navigateTo(preview ? '/subscription?preview=true' : '/subscription');
    } else if (targetTab === 'vault' || targetTab === 'dms' || targetTab === 'assets' || targetTab === 'wills' || targetTab === 'beneficiaries') {
      navigateTo(preview ? previewRoute(targetTab, window.location.search, lang) : `/${targetTab}`);
    }
  };

  if (isAccountProfileRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessAccountProfile(session)) {
      return (
        <div className="lv-app-root">
          <main role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p>{lang === 'en' ? 'Access restricted' : 'Từ chối quyền truy cập'}</p>
            <button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button>
          </main>
        </div>
      );
    }
    const shellRole = session?.user?.roles?.includes('STAFF_EXECUTOR')
      ? 'STAFF'
      : session?.user?.roles?.includes('LEGAL_VERIFIER')
      ? 'LEGAL'
      : session?.user?.roles?.includes('ADMIN') && !session?.user?.roles?.includes('VAULT_OWNER') ? 'ADMIN' : session?.user?.roles?.includes('BENEFICIARY') && !session?.user?.roles?.includes('VAULT_OWNER') ? 'BENEFICIARY' : 'OWNER';

    return (
      <div className="lv-app-root">
        <AppShell
          role={shellRole}
          currentTab="account-profile"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={handleExecuteNavigation}
        >
          <AccountProfilePage
            session={session}
            lang={lang}
            preview={preview}
            onNavigateEdit={() => navigateTo(resolveAccountRoute('/account/edit'))}
            onRefreshSession={(updatedUser, requestedSession) => {
              setSession(currentSession => {
                if (!isSessionActive(currentSession) ||
                    currentSession.accessToken !== requestedSession?.accessToken ||
                    currentSession.user?.id !== requestedSession?.userId ||
                    updatedUser.id !== currentSession.user?.id) return currentSession;
                return { ...currentSession, user: updatedUser };
              });
            }}
          />
        </AppShell>
      </div>
    );
  }

  if (isAccountEditRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessAccountEdit(session)) {
      return (
        <div className="lv-app-root">
          <main role="alert" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <p>{lang === 'en' ? 'Access restricted' : 'Từ chối quyền truy cập'}</p>
            <button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button>
          </main>
        </div>
      );
    }
    const shellRole = session?.user?.roles?.includes('STAFF_EXECUTOR')
      ? 'STAFF'
      : session?.user?.roles?.includes('LEGAL_VERIFIER')
      ? 'LEGAL'
      : session?.user?.roles?.includes('ADMIN') && !session?.user?.roles?.includes('VAULT_OWNER') ? 'ADMIN' : session?.user?.roles?.includes('BENEFICIARY') && !session?.user?.roles?.includes('VAULT_OWNER') ? 'BENEFICIARY' : 'OWNER';

    return (
      <div className="lv-app-root">
        <AppShell
          role={shellRole}
          currentTab="account-edit"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (isEditFormDirty) {
              setPendingNavigationTarget({ type: 'TAB', tab });
            } else {
              handleExecuteNavigation(tab);
            }
          }}
        >
          <AccountEditPage
            session={session}
            preview={preview}
            lang={lang}
            onDirtyChange={setIsEditFormDirty}
            pendingNavigation={pendingNavigationTarget}
            onConfirmNavigation={() => {
              const target = pendingNavigationTarget;
              isEditFormDirtyRef.current = false;
              setIsEditFormDirty(false);
              setPendingNavigationTarget(null);
              if (target?.type === 'POPSTATE') {
                if (typeof target.delta === 'number' && target.delta !== 0) {
                  historyIndexRef.current = historyIndexRef.current + target.delta;
                  window.history.go(target.delta);
                } else if (target.targetPath) {
                  setLocation(target.targetPath);
                }
              } else if (target?.type === 'TAB') {
                handleExecuteNavigation(target.tab);
              } else if (typeof target === 'string') {
                handleExecuteNavigation(target);
              }
            }}
            onCancelNavigation={() => setPendingNavigationTarget(null)}
            onCancel={() => {
              isEditFormDirtyRef.current = false;
              setIsEditFormDirty(false);
              setPendingNavigationTarget(null);
              navigateTo(preview ? '/account/profile?preview=true' : '/account/profile');
            }}
          />
        </AppShell>
      </div>
    );
  }

  if (path === '/staff/beneficiary-accounts') {
    if (!isSessionActive(session) && !preview) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!preview && !session?.user?.roles?.includes('STAFF_EXECUTOR')) return <main role="alert"><p>{lang === 'en' ? 'Access denied.' : 'Bạn không có quyền truy cập.'}</p><button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    return <div className="lv-app-root"><BeneficiaryAccountPage key={session?.user.id || 'preview'} accessToken={session?.accessToken} isDevPreview={preview} lang={lang} onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} /></div>;
  }
  if (isStaffLegalDocsRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !canAccessStaffLegalDocuments(session)) {
      return <StaffAccessDeniedFallback lang={lang} onLogout={logout} />;
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="STAFF"
          currentTab="legal-documents"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            } else if (tab === 'beneficiary-confirmation') {
              navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
            } else if (tab === 'completion-progress') {
              navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
            } else if (tab === 'close-and-archive') {
              navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
            } else if (tab === 'asset-handover') {
              navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
            }
          }}
        >
          <StaffLegalDocumentsPage
            lang={lang}
            preview={preview}
            session={session}
            onNavigateHome={() => navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents')}
          />
        </AppShell>
      </div>
    );
  }

  if (isStaffAssetHandoverRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !canAccessScopedAssetHandover(session)) {
      return <StaffAccessDeniedFallback lang={lang} onLogout={logout} />;
    }
    return (
      <div className="lv-app-root">
        <StaffShell session={session} user={session?.user || null} onNavigateProfile={() => navigateTo(resolveAccountRoute('/account/profile'))} onNavigateAccountEdit={() => navigateTo(resolveAccountRoute('/account/edit'))}
          lang={lang}
          onToggleLang={setLang}
          onLogout={session ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          isPreview={preview}
          currentTab="asset-handover"
          onNavigateCases={() => navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases')}
          onNavigateLegalDocuments={() => navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents')}
          onNavigateAssetHandover={() => navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover')}
          onNavigateCloseAndArchive={() => navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive')}
          onNavigateCompletionProgress={() => navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress')}
          onNavigateBeneficiaryConfirmation={() => navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation')}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
            } else if (tab === 'beneficiary-confirmation') {
              navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
            } else if (tab === 'completion-progress') {
              navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
            } else if (tab === 'close-and-archive') {
              navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
            } else if (tab === 'asset-handover') {
              navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
            }
          }}
        >
          <ScopedAssetHandoverPage
            lang={lang}
            preview={preview}
            session={session}
          />
        </StaffShell>
      </div>
    );
  }

  if (isStaffBeneficiaryConfirmationRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !canAccessBeneficiaryConfirmation(session)) {
      return <StaffAccessDeniedFallback lang={lang} onLogout={logout} />;
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="STAFF"
          currentTab="beneficiary-confirmation"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'completion-progress') {
              navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
            } else if (tab === 'close-and-archive') {
              navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
            } else if (tab === 'asset-handover') {
              navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
            } else if (tab === 'beneficiary-confirmation') {
              navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <BeneficiaryConfirmationPage
            lang={lang}
            preview={preview}
            session={session}
          />
        </AppShell>
      </div>
    );
  }

  if (isStaffCompletionProgressRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !canAccessCompletionProgress(session)) {
      return <StaffAccessDeniedFallback lang={lang} onLogout={logout} />;
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="STAFF"
          currentTab="completion-progress"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'close-and-archive') {
              navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
            } else if (tab === 'asset-handover') {
              navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
            } else if (tab === 'beneficiary-confirmation') {
              navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
            } else if (tab === 'completion-progress') {
              navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <CompletionProgressPage
            lang={lang}
            preview={preview}
            session={session}
          />
        </AppShell>
      </div>
    );
  }

  if (isStaffCloseArchiveRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !canAccessCloseArchive(session)) {
      return <StaffAccessDeniedFallback lang={lang} onLogout={logout} />;
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="STAFF"
          currentTab="close-and-archive"
          lang={lang}
          onToggleLang={setLang}
          isAuthenticated={isSessionActive(session)}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'asset-handover') {
              navigateTo(preview ? '/staff/asset-handover?preview=true' : '/staff/asset-handover');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
            } else if (tab === 'beneficiary-confirmation') {
              navigateTo(preview ? '/staff/beneficiary-confirmation?preview=true' : '/staff/beneficiary-confirmation');
            } else if (tab === 'completion-progress') {
              navigateTo(preview ? '/staff/completion-progress?preview=true' : '/staff/completion-progress');
            } else if (tab === 'close-and-archive') {
              navigateTo(preview ? '/staff/close-and-archive?preview=true' : '/staff/close-and-archive');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <CloseAndArchivePage
            lang={lang}
          />
        </AppShell>
      </div>
    );
  }

  if (path === '/legal/controlled-unlock') {
    if (!isSessionActive(session) && !preview) return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    if (!preview && !session?.user?.roles?.includes('LEGAL_VERIFIER')) return <main role="alert"><p>{lang === 'en' ? 'Access denied.' : 'Bạn không có quyền truy cập.'}</p><button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    return <div className="lv-app-root"><ControlledUnlockPage key={session?.user.id || 'preview'} accessToken={session?.accessToken} isDevPreview={preview} lang={lang} onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} /></div>;
  }
  if (isLegalDeathRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessLegalDeathVerification(session)) {
      return (
        <div className="lv-app-root">
          <LegalAccessDeniedFallback
            lang={lang}
            onLogout={logout}
            onNavigateToVault={() => navigateTo('/vault')}
            canReturnToVault={Boolean(session?.user?.roles?.includes('VAULT_OWNER'))}
          />
        </div>
      );
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="LEGAL"
          currentTab="death-verification"
          isAuthenticated={isSessionActive(session)}
          session={session}
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onNavigateTab={(tab) => {
            if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <LegalDeathVerificationPage
            session={session}
            lang={lang}
          />
        </AppShell>
      </div>
    );
  }

  if (isLegalWillRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessLegalWillVerification(session)) {
      return (
        <div className="lv-app-root">
          <LegalAccessDeniedFallback
            lang={lang}
            onLogout={logout}
            onNavigateToVault={() => navigateTo('/vault')}
            canReturnToVault={Boolean(session?.user?.roles?.includes('VAULT_OWNER'))}
          />
        </div>
      );
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="LEGAL"
          currentTab="will-document-verification"
          isAuthenticated={isSessionActive(session)}
          session={session}
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onNavigateTab={(tab) => {
            if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <LegalWillDocumentVerificationPage
            session={session}
            lang={lang}
          />
        </AppShell>
      </div>
    );
  }

  if (isLegalBasisRoute) {
    if (!isSessionActive(session) && !preview) {
      return (
        <div className="lv-app-root">
          <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
        </div>
      );
    }
    if (!preview && !canAccessLegalBasisRoute(session)) {
      return (
        <div className="lv-app-root">
          <LegalAccessDeniedFallback
            lang={lang}
            onLogout={logout}
            onNavigateToVault={() => navigateTo('/vault')}
            canReturnToVault={Boolean(session?.user?.roles?.includes('VAULT_OWNER'))}
          />
        </div>
      );
    }
    return (
      <div className="lv-app-root">
        <AppShell
          role="LEGAL"
          currentTab="basis-route-selection"
          isAuthenticated={isSessionActive(session)}
          session={session}
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={isSessionActive(session) ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onNavigateTab={(tab) => {
            if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
            } else if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
              navigateTo(resolveAccountRoute('/account/profile'));
            } else if (tab === 'account-edit') {
              navigateTo(resolveAccountRoute('/account/edit'));
            }
          }}
        >
          <LegalBasisRouteSelectionPage
            session={session}
            lang={lang}
          />
        </AppShell>
      </div>
    );
  }
  if (isVaultRoute || isDmsRoute || isAssetsRoute || isWillsRoute || isBeneficiariesRoute || isSubscriptionRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !session.user.roles.includes('VAULT_OWNER')) {
      return <main role="alert"><p>{lang === 'en' ? 'This page requires a Vault Owner account.' : 'Trang này dành cho tài khoản chủ sở hữu kho.'}</p>
        <button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    }
    const context = {
      accessToken: session?.accessToken, ownerId: session?.user.id,
      onUnauthorized: logout, lang, onNavigateToLogin: logout, onRefreshTrigger: refreshTrigger
    };
    return <div className="lv-app-root"><AppShell currentTab={isSubscriptionRoute ? 'subscription' : isBeneficiariesRoute ? 'beneficiaries' : isWillsRoute ? 'wills' : isAssetsRoute ? 'assets' : isDmsRoute ? 'dms' : 'vault'} lang={lang}
      role="OWNER" isAuthenticated={isSessionActive(session)} onToggleLang={setLang} onLogout={isSessionActive(session) ? logout : null} onRefresh={handleRefresh} isRefreshing={isRefreshing} session={session} user={session?.user || null}
      onNavigateTab={tab => {
        if (tab === 'beneficiary-home') { navigateTo('/beneficiary');
            } else if (tab === 'account-profile') {
          navigateTo(resolveAccountRoute('/account/profile'));
        } else if (tab === 'account-edit') {
          navigateTo(resolveAccountRoute('/account/edit'));
        } else if (tab === 'vault' || tab === 'dms' || tab === 'assets' || tab === 'wills' || tab === 'beneficiaries' || tab === 'subscription') {
          navigateTo(preview ? previewRoute(tab, window.location.search, lang) : (tab === 'subscription' ? (preview ? '/subscription?preview=true' : '/subscription') : `/${tab}`));
        }
      }}>
      {preview && isWillsRoute ? <section className="lv-overview-summary" aria-label={lang === 'en' ? 'Preview availability' : 'Phạm vi xem thử'}>
        <h2>{lang === 'en' ? 'Digital Will Documents' : 'Hồ sơ di chúc số'}</h2>
        <p>{lang === 'en' ? 'This screen uses the live API and has no simulated data yet. Sign in to test it with your own vault.' : 'Màn hình này sử dụng API thật và chưa có dữ liệu mô phỏng. Hãy đăng nhập để thử với kho của bạn.'}</p>
        <button type="button" className="lv-summary-cta-btn lv-summary-cta-btn--primary" onClick={() => navigateTo(previewRoute('vault', window.location.search, lang))}>{lang === 'en' ? 'Back to preview' : 'Quay lại tổng quan'}</button>
        <button type="button" className="lv-summary-cta-btn lv-summary-cta-btn--gold" onClick={() => navigateTo('/login')}>{lang === 'en' ? 'Sign in' : 'Đăng nhập'}</button>
      </section> : isSubscriptionRoute ? <SubscriptionPage key={session?.user.id || 'preview'} {...context} isDevPreview={preview} />
        : isBeneficiariesRoute ? <TrusteeBeneficiaryRoute key={session?.user.id || 'preview'} {...context} isDevPreview={preview} onNavigateToVault={() => navigateTo(preview ? previewRoute('vault', window.location.search, lang) : '/vault')} />
        : isWillsRoute ? <WillsRoute key={session?.user.id || 'preview'} {...context} onNavigateToVault={() => navigateTo(preview ? previewRoute('vault', window.location.search, lang) : '/vault')} />
          : isAssetsRoute ? <AssetsRoute key={session?.user.id || 'preview'} {...context} onNavigateToVault={() => navigateTo(preview ? previewRoute('vault', window.location.search, lang) : '/vault')} />
            : isDmsRoute ? <DMSOverviewPage key={session?.user.id || 'preview'} {...context} isDevPreview={preview} />
              : <VaultOverviewPage onNavigate={tab => navigateTo(preview ? previewRoute(tab, window.location.search, lang) : `/${tab}`)} key={session?.user.id || 'preview'} {...context} showDevToolbar={preview} />}
    </AppShell></div>;
  }
  if (path === '/') return <LandingPage onLogin={() => navigateTo('/login')} onRegister={() => navigateTo('/register')} />;
  return <div className="lv-app-root">{path === '/register'
    ? <RegisterPageHenedo onNavigateToLogin={() => navigateTo('/login')} />
    : path === '/login' ? <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
      : <NotFoundFallback onNavigateToRegister={() => navigateTo('/register')} onNavigateToLogin={() => navigateTo('/login')} />}</div>;
}
