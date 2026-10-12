import { useState, useEffect } from 'react';
import RegisterPageHenedo from './pages/auth/RegisterPageHenedo.jsx';

function NotFoundFallback({ currentPath, onNavigateToRegister }) {
  const isLogin = currentPath === '/login';

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
          {isLogin ? '✦' : '404'}
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
          {isLogin ? 'Trang chưa khả dụng' : 'Không tìm thấy trang'}
        </h1>

        <p
          style={{
            fontSize: '14.5px',
            color: '#6b726b',
            lineHeight: 1.6,
            margin: '0 0 28px',
          }}
        >
          {isLogin
            ? 'Cổng đăng nhập hiện chưa mở. Vui lòng bắt đầu tại trang Đăng ký tài khoản.'
            : 'Đường dẫn bạn yêu cầu không tồn tại hoặc chưa được kích hoạt trong hệ thống.'}
        </p>

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
            padding: '12px 26px',
            borderRadius: '10px',
            border: 'none',
            cursor: 'pointer',
            transition: 'background-color 0.2s ease',
          }}
        >
          <span>Về trang Đăng ký</span>
          <span aria-hidden="true">→</span>
        </button>
      </div>
    </main>
  );
}

export default function App() {
  const [currentPath, setCurrentPath] = useState(() => {
    return typeof window !== 'undefined' ? window.location.pathname : '/register';
  });

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

  // Các route hợp lệ cho PS-1: /register và / (mặc định mở Register)
  const isRegisterRoute = currentPath === '/register' || currentPath === '/';

  return (
    <div className="lv-app-root">
      {isRegisterRoute ? (
        <RegisterPageHenedo />
      ) : (
        <NotFoundFallback
          currentPath={currentPath}
          onNavigateToRegister={() => navigateTo('/register')}
        />
      )}
    </div>
  );
}
