import { useState, useEffect } from 'react';
import RegisterPageHenedo from './pages/auth/RegisterPageHenedo.jsx';
import LoginPage from './pages/auth/LoginPage.jsx';
import VaultOverviewPage from './pages/vault/VaultOverviewPage.jsx';
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
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/register';
  });
  const [lang, setLang] = useState('vi');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const navigateTo = (path) => {
    window.history.pushState({}, '', path);
    setCurrentPath(path);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    setRefreshTrigger((prev) => prev + 1);
    await new Promise((r) => setTimeout(r, 600));
    setIsRefreshing(false);
  };

  // Environment gating
  const isDev = Boolean(import.meta.env.DEV);
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const hasPreviewParam = searchParams?.get('preview') === 'true';

  // PS-1 routes: /register và / (mặc định mở Register)
  const isRegisterRoute = currentPath === '/register' || currentPath === '/';

  // PS-2 route: /login
  const isLoginRoute = currentPath === '/login';

  // PS-3 Vault route:
  // - DEV mode:
  //   - /vault?preview=true: Mở Vault UI kèm thanh kịch bản kiểm thử (DEV toolbar)
  //   - /vault: Mở Vault UI sạch (clean view, không hiển thị DEV toolbar)
  // - Production mode: Không cho phép preview; không mở bypass auth khi chưa có session thật.
  const isVaultRoute = currentPath === '/vault' || currentPath === '/vaults';

  if (isDev && isVaultRoute) {
    return (
      <div className="lv-app-root">
        <AppShell
          currentTab="vault"
          lang={lang}
          onToggleLang={setLang}
          onLogout={() => navigateTo('/login')}
          onRefresh={handleRefresh}
          isRefreshing={isRefreshing}
          onNavigateTab={(tab) => {
            if (tab === 'vault') {
              navigateTo(hasPreviewParam ? '/vault?preview=true' : '/vault');
            }
          }}
        >
          <VaultOverviewPage
            lang={lang}
            showDevToolbar={hasPreviewParam}
            onNavigateToLogin={() => navigateTo('/login')}
            onRefreshTrigger={refreshTrigger}
          />
        </AppShell>
      </div>
    );
  }

  return (
    <div className="lv-app-root">
      {isRegisterRoute ? (
        <RegisterPageHenedo onNavigateToLogin={() => navigateTo('/login')} />
      ) : isLoginRoute ? (
        <LoginPage onNavigateToRegister={() => navigateTo('/register')} />
      ) : (
        <NotFoundFallback
          onNavigateToRegister={() => navigateTo('/register')}
          onNavigateToLogin={() => navigateTo('/login')}
        />
      )}
    </div>
  );
}
