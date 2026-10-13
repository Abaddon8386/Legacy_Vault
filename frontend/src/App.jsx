import { useState, useEffect, useCallback } from 'react';
import RegisterPageHenedo from './pages/auth/RegisterPageHenedo.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import VaultOverviewPage from './pages/vault/VaultOverviewPage.jsx';
import DMSOverviewPage from './pages/dms/DMSOverviewPage.jsx';
import { request, ApiError } from './api/http.js';
import { readUser } from './api/contracts.js';
import { createSession, isSessionActive } from './utils/session.js';
import AppShell from './components/layout/AppShell.jsx';

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

export default function App() {
  const [location, setLocation] = useState(() => window.location.pathname + window.location.search);
  const [lang, setLang] = useState('vi');
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
    setSession({ ...candidate, user }); setLang(options.lang || 'vi'); navigateTo('/vault');
  };
  const handleRefresh = async () => {
    setIsRefreshing(true); setRefreshTrigger(value => value + 1);
    setIsRefreshing(false);
  };
  const path = location.split('?')[0];
  const preview = Boolean(import.meta.env.DEV && !session && new URLSearchParams(location.split('?')[1] || '').get('preview') === 'true');
  const isVaultRoute = path === '/vault' || path === '/vaults';
  const isDmsRoute = path === '/dms';
  if (isVaultRoute || isDmsRoute) {
    if (!isSessionActive(session) && !preview) {
      return <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />;
    }
    if (!preview && !session.user.roles.includes('VAULT_OWNER')) {
      return <main role="alert"><p>{lang === 'en' ? 'This page requires a Vault Owner account.' : 'Trang này dành cho tài khoản chủ sở hữu kho.'}</p>
        <button onClick={logout}>{lang === 'en' ? 'Sign in again' : 'Đăng nhập lại'}</button></main>;
    }
    const context = { accessToken: session?.accessToken, ownerId: session?.user.id,
      onUnauthorized: logout, lang, onNavigateToLogin: logout, onRefreshTrigger: refreshTrigger };
    return <div className="lv-app-root"><AppShell currentTab={isDmsRoute ? 'dms' : 'vault'} lang={lang}
      onToggleLang={setLang} onLogout={logout} onRefresh={handleRefresh} isRefreshing={isRefreshing}
      onNavigateTab={tab => { if (tab === 'vault' || tab === 'dms') navigateTo(`/${tab}${preview ? '?preview=true' : ''}`); }}>
      {isDmsRoute ? <DMSOverviewPage key={session?.user.id || 'preview'} {...context} isDevPreview={preview} />
        : <VaultOverviewPage key={session?.user.id || 'preview'} {...context} showDevToolbar={preview} />}
    </AppShell></div>;
  }
  return <div className="lv-app-root">{path === '/' || path === '/register'
    ? <RegisterPageHenedo onNavigateToLogin={() => navigateTo('/login')} />
    : path === '/login' ? <LoginPage onAuthenticated={establishSession} onNavigateToRegister={() => navigateTo('/register')} />
    : <NotFoundFallback onNavigateToRegister={() => navigateTo('/register')} onNavigateToLogin={() => navigateTo('/login')} />}</div>;
}
