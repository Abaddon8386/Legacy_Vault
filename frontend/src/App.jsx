import { previewRoute } from './utils/previewState.js';
import { useState, useEffect, useCallback } from 'react';
import RegisterPageHenedo from './pages/auth/RegisterPageHenedo.jsx';
import LandingPage from './pages/landing/LandingPage.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import VaultOverviewPage from './pages/vault/VaultOverviewPage.jsx';
import DMSOverviewPage from './pages/dms/DMSOverviewPage.jsx';
import { request, ApiError } from './api/http.js';
import { readUser } from './api/contracts.js';
import { createSession, isSessionActive } from './utils/session.js';
import AssetsRoute from './pages/assets/AssetsRoute.jsx';
import WillsRoute from './pages/wills/WillsRoute.jsx';
import TrusteeBeneficiaryRoute from './pages/trusteeBeneficiary/TrusteeBeneficiaryRoute.jsx';
import LegalDossierReviewPage from './pages/legal/LegalDossierReviewPage.jsx';
import { canAccessLegalDossierReview } from './utils/legalDossierReviewValidation.js';
import StaffLegalDocumentsPage from './pages/staff/StaffLegalDocumentsPage.jsx';
import { canAccessStaffLegalDocuments, resolvePostLoginRoute } from './utils/staffLegalDocumentsValidation.js';
import AppShell from './components/layout/AppShell.jsx';
import StaffShell from './components/layout/StaffShell.jsx';
import StaffCaseDashboard from './pages/staff/StaffCaseDashboard.jsx';
import LegalDeathVerificationPage from './pages/legal/LegalDeathVerificationPage.jsx';
import { canAccessLegalDeathVerification } from './utils/legalDeathVerificationValidation.js';
import LegalWillDocumentVerificationPage from './pages/legal/LegalWillDocumentVerificationPage.jsx';
import { canAccessLegalWillVerification } from './utils/legalWillVerificationValidation.js';
import LegalBasisRouteSelectionPage from './pages/legal/LegalBasisRouteSelectionPage.jsx';
import { canAccessLegalBasisRoute } from './utils/legalBasisRouteValidation.js';


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
  const [session, setSession] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const navigateTo = useCallback(path => {
    window.history.pushState({}, '', path); setLocation(path);
  }, []);
  const logout = useCallback(() => { setSession(null); navigateTo('/login'); }, [navigateTo]);
  useEffect(() => {
    const sync = () => setLocation(window.location.pathname + window.location.search);
    window.addEventListener('popstate', sync);
    return () => window.removeEventListener('popstate', sync);
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
  const preview = Boolean(import.meta.env.DEV && !session && new URLSearchParams(location.split('?')[1] || '').get('preview') === 'true');
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
        <StaffShell
          lang={lang}
          onToggleLang={setLang}
          onLogout={logout}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          isPreview={preview}
          onNavigateLegalDocuments={() => navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents')}
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
          onLogout={logout}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user}
          onNavigateTab={tab => {
            if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
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
  const isStaffLegalDocsRoute = path === '/staff/legal-documents';
  const isLegalDeathRoute = path === '/legal' || path === '/legal/death-verification';
  const isLegalWillRoute = path === '/legal/will-document-verification';
  const isLegalBasisRoute = path === '/legal/basis-route-selection';

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
          onLogout={session ? logout : null}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          session={session}
          user={session?.user || null}
          onNavigateTab={tab => {
            if (tab === 'cases') {
              navigateTo(preview ? '/staff/cases?preview=true' : '/staff/cases');
            } else if (tab === 'legal-documents') {
              navigateTo(preview ? '/staff/legal-documents?preview=true' : '/staff/legal-documents');
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
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={session ? logout : null}
          onNavigateTab={(tab) => {
            if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
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
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={session ? logout : null}
          onNavigateTab={(tab) => {
            if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
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
          user={session?.user || null}
          lang={lang}
          onToggleLang={setLang}
          onLogout={session ? logout : null}
          onNavigateTab={(tab) => {
            if (tab === 'basis-route-selection') {
              navigateTo(preview ? '/legal/basis-route-selection?preview=true' : '/legal/basis-route-selection');
            } else if (tab === 'death-verification') {
              navigateTo(preview ? '/legal/death-verification?preview=true' : '/legal/death-verification');
            } else if (tab === 'will-document-verification') {
              navigateTo(preview ? '/legal/will-document-verification?preview=true' : '/legal/will-document-verification');
            } else if (tab === 'dossier-review') {
              navigateTo(preview ? '/legal/dossier-review?preview=true' : '/legal/dossier-review');
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
  if (isVaultRoute || isDmsRoute || isAssetsRoute || isWillsRoute || isBeneficiariesRoute) {
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
    return <div className="lv-app-root"><AppShell currentTab={isBeneficiariesRoute ? 'beneficiaries' : isWillsRoute ? 'wills' : isAssetsRoute ? 'assets' : isDmsRoute ? 'dms' : 'vault'} lang={lang}
      onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} isRefreshing={isRefreshing}
      onNavigateTab={tab => { if (tab === 'vault' || tab === 'dms' || tab === 'assets' || tab === 'wills' || tab === 'beneficiaries') navigateTo(preview ? previewRoute(tab, window.location.search, lang) : `/${tab}`); }}>
      {preview && (isBeneficiariesRoute || isWillsRoute) ? <section className="lv-overview-summary" aria-label={lang === 'en' ? 'Preview availability' : 'Phạm vi xem thử'}>
        <h2>{isWillsRoute ? (lang === 'en' ? 'Digital Will Documents' : 'Hồ sơ di chúc số') : (lang === 'en' ? 'Beneficiaries & Trustees' : 'Người thụ hưởng và người giám hộ')}</h2>
        <p>{lang === 'en' ? 'This screen uses the live API and has no simulated data yet. Sign in to test it with your own vault.' : 'Màn hình này sử dụng API thật và chưa có dữ liệu mô phỏng. Hãy đăng nhập để thử với kho của bạn.'}</p>
        <button type="button" className="lv-summary-cta-btn lv-summary-cta-btn--primary" onClick={() => navigateTo(previewRoute('vault', window.location.search, lang))}>{lang === 'en' ? 'Back to preview' : 'Quay lại tổng quan'}</button>
        <button type="button" className="lv-summary-cta-btn lv-summary-cta-btn--gold" onClick={() => navigateTo('/login')}>{lang === 'en' ? 'Sign in' : 'Đăng nhập'}</button>
      </section> : isBeneficiariesRoute ? <TrusteeBeneficiaryRoute key={session?.user.id || 'preview'} {...context} onNavigateToVault={() => navigateTo(preview ? previewRoute('vault', window.location.search, lang) : '/vault')} />
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
