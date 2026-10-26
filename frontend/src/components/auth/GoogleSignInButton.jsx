import { useEffect, useRef, useState } from 'react';
import { getAuthMessage } from '../../utils/loginService.js';
import { loadGoogleIdentityScript } from '../../utils/googleIdentity.js';
import './GoogleSignInButton.css';

/**
 * Official Google 4-color "G" Icon conforming to Google Branding Guidelines.
 */
export function GoogleGIcon({ size = 18 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      className="lv-google-g-svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
        fill="#EA4335"
      />
    </svg>
  );
}

/**
 * Google Sign-In Button component.
 * Supports official GIS rendered button and brand-compliant fallback when Client ID is unconfigured.
 */
export default function GoogleSignInButton({
  id = 'lv-google-btn',
  disabled = false,
  lang = 'vi',
  text = 'continue_with',
  onCredentialReceived,
  onError,
  customUnavailableNotice = null,
}) {
  const containerRef = useRef(null);
  const isPendingRef = useRef(false);
  const onCredentialReceivedRef = useRef(onCredentialReceived);
  const onErrorRef = useRef(onError);
  const disabledRef = useRef(disabled);

  useEffect(() => {
    onCredentialReceivedRef.current = onCredentialReceived;
    onErrorRef.current = onError;
    disabledRef.current = disabled;
  }, [onCredentialReceived, onError, disabled]);

  const clientId = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_CLIENT_ID) || '';
  const isConfigured = Boolean(clientId.trim());

  const [gisLoaded, setGisLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  const labelText = lang === 'en' ? 'Continue with Google' : 'Tiếp tục với Google';
  const unconfiguredNotice =
    customUnavailableNotice ||
    (lang === 'en'
      ? 'Google sign-in is currently unavailable'
      : 'Đăng nhập Google hiện chưa khả dụng');
  const errorNotice =
    lang === 'en'
      ? 'Unable to connect to Google services. Please try again later.'
      : 'Không thể kết nối đến dịch vụ Google. Vui lòng thử lại sau.';
  const activeNotice = hasError ? errorNotice : unconfiguredNotice;

  useEffect(() => {
    let isMounted = true;

    if (!isConfigured) {
      return;
    }

    loadGoogleIdentityScript()
      .then(() => {
        if (!isMounted) return;
        if (!window.google?.accounts?.id) {
          setHasError(true);
          onErrorRef.current?.({
            code: 'GOOGLE_SCRIPT_LOAD_ERROR',
            message: getAuthMessage('GOOGLE_SCRIPT_LOAD_ERROR', lang),
          });
          return;
        }

        window.google.accounts.id.initialize({
          client_id: clientId.trim(),
          callback: (response) => {
            if (!isMounted || disabledRef.current || isPendingRef.current) return;
            if (response?.credential) {
              onCredentialReceivedRef.current?.(response);
            } else {
              onErrorRef.current?.({
                code: 'INVALID_GOOGLE_CREDENTIAL',
                message: getAuthMessage('INVALID_GOOGLE_CREDENTIAL', lang),
              });
            }
          },
          auto_select: false,
          cancel_on_tap_outside: true,
        });

        if (containerRef.current) {
          containerRef.current.innerHTML = '';
          window.google.accounts.id.renderButton(containerRef.current, {
            type: 'standard',
            theme: 'outline',
            size: 'large',
            text: text === 'signup_with' ? 'signup_with' : 'continue_with',
            shape: 'rectangular',
            logo_alignment: 'left',
            width: Math.min(360, containerRef.current.parentElement?.clientWidth || 360),
            locale: lang === 'vi' ? 'vi' : 'en',
          });
          setHasError(false);
          setGisLoaded(true);
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        setHasError(true);
        onErrorRef.current?.({
          code: 'GOOGLE_SCRIPT_LOAD_ERROR',
          message: getAuthMessage('GOOGLE_SCRIPT_LOAD_ERROR', lang),
          originalError: err,
        });
      });

    return () => {
      isMounted = false;
    };
  }, [clientId, isConfigured, lang, text]);

  const showGis = isConfigured && gisLoaded && !hasError;
  const isButtonDisabled = disabled || !isConfigured || hasError;

  const handleCustomClick = () => {
    if (isButtonDisabled) return;
  };

  return (
    <div className="lv-google-auth-wrapper">
      {/* Official GIS Render Container */}
      <div
        id={`${id}-container`}
        ref={containerRef}
        className={`lv-google-rendered-container ${disabled ? 'is-disabled' : ''}`}
        style={{ display: showGis ? 'flex' : 'none' }}
        aria-hidden={!showGis}
      />

      {/* Fallback Custom Button conforming to Google branding guidelines */}
      {!showGis && (
        <>
          <button
            type="button"
            id={id}
            className="lv-google-btn-custom"
            disabled={isButtonDisabled}
            onClick={handleCustomClick}
            aria-label={labelText}
            title={!isConfigured || hasError ? activeNotice : labelText}
          >
            <span className="lv-google-btn-icon">
              <GoogleGIcon size={18} />
            </span>
            <span className="lv-google-btn-text">{labelText}</span>
          </button>
          {(!isConfigured || hasError) && (
            <div className="lv-google-unavailable-notice" role="status">
              {activeNotice}
            </div>
          )}
        </>
      )}
    </div>
  );
}
