import { useState, useRef, useEffect, useCallback } from 'react';
import {
  User,
  Mail,
  Shield,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Edit3,
  Link2,
} from 'lucide-react';
import { request } from '../../api/http.js';
import { readUser } from '../../api/contracts.js';
import {
  formatRoleName,
  isValidUserProfile,
  resolveActiveProfileUser,
  canApplyProfileRefresh,
} from '../../utils/accountProfileValidation.js';
import { accountProfileI18n } from './accountProfileI18n.js';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton.jsx';
import { linkGoogleAccount } from '../../utils/googleLinkService.js';
import { getAuthMessage } from '../../utils/loginService.js';
import './AccountProfilePage.css';
import {EmailVerificationPanel} from '../auth/EmailVerification.jsx';

export default function AccountProfilePage({
  session = null,
  lang = 'vi',
  onRefreshSession,
  preview = false,
  onNavigateEdit,
}) {
  const t = accountProfileI18n[lang] || accountProfileI18n.vi;

  const sessionRef = useRef(session);
  const refreshRequestRef = useRef(null);
  const linkRequestRef = useRef(null);
  const isLinkingRef = useRef(false);
  const prevUserIdRef = useRef(session?.user?.id);
  const prevTokenRef = useRef(session?.accessToken);

  const [refreshedData, setRefreshedData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const [isLinking, setIsLinking] = useState(false);
  const [linkedInSession, setLinkedInSession] = useState(false);
  const [linkFeedback, setLinkFeedback] = useState(null);

  useEffect(() => {
    sessionRef.current = session;
    const tokenChanged = session?.accessToken !== prevTokenRef.current;
    const userChanged = session?.user?.id !== prevUserIdRef.current;

    if (tokenChanged || userChanged) {
      prevTokenRef.current = session?.accessToken;
      prevUserIdRef.current = session?.user?.id;

      // Abort old request and ensure button is never stuck in linking state
      refreshRequestRef.current?.abort();
      refreshRequestRef.current = null;
      linkRequestRef.current?.abort();
      linkRequestRef.current = null;
      isLinkingRef.current = false;
      setIsLinking(false);

      if (userChanged) {
        setLinkedInSession(false);
        setLinkFeedback(null);
      }
    }

  }, [session]);

  useEffect(() => () => {
      sessionRef.current = null;
      refreshRequestRef.current?.abort();
      refreshRequestRef.current = null;
      linkRequestRef.current?.abort();
      linkRequestRef.current = null;
      isLinkingRef.current = false;
  }, []);

  const profileUser = resolveActiveProfileUser(refreshedData, session);
  const activeToken = session?.accessToken || null;
  const activeFeedback = feedback?.token === activeToken ? feedback : null;
  const activeLinkFeedback = linkFeedback?.token === activeToken ? linkFeedback : null;

  // Fetch fresh profile from GET /auth/me
  const handleRefresh = async () => {
    const currentToken = sessionRef.current?.accessToken;
    const currentUserId = sessionRef.current?.user?.id;

    if (!currentToken || !currentUserId) {
      return;
    }

    refreshRequestRef.current?.abort();
    const controller = new AbortController();
    refreshRequestRef.current = controller;
    setIsRefreshing(true);
    setFeedback(null);

    try {
      const raw = await request('/auth/me', {
        accessToken: currentToken,
        signal: controller.signal,
        lang,
      });
      if (controller.signal.aborted || refreshRequestRef.current !== controller) return;
      const validatedUser = readUser(raw);

      const latestSession = sessionRef.current;
      if (!canApplyProfileRefresh(validatedUser, latestSession, currentToken, currentUserId)) {
        // Discard stale or mismatched response immediately
        return;
      }

      setRefreshedData({
        userId: currentUserId,
        token: currentToken,
        user: validatedUser,
      });
      setFeedback({
        type: 'success',
        message: t.refreshSuccess,
        token: currentToken,
      });

      if (typeof onRefreshSession === 'function') {
        onRefreshSession(validatedUser, { accessToken: currentToken, userId: currentUserId });
      }
    } catch {
      if (controller.signal.aborted || refreshRequestRef.current !== controller) return;
      const latestSession = sessionRef.current;
      if (
        latestSession?.accessToken === currentToken &&
        latestSession?.user?.id === currentUserId
      ) {
        setFeedback({
          type: 'error',
          message: t.refreshError,
          token: currentToken,
        });
      }
    } finally {
      if (refreshRequestRef.current === controller) {
        refreshRequestRef.current = null;
        setIsRefreshing(false);
      }
    }
  };

  const handleGoogleCredential = useCallback(
    async (credentialResponse) => {
      const currentToken = sessionRef.current?.accessToken;
      const currentUserId = sessionRef.current?.user?.id;

      if (!currentToken || !currentUserId || isLinkingRef.current) {
        return;
      }

      const credential = credentialResponse?.credential;
      if (!credential) {
        setLinkFeedback({
          type: 'error',
          message: getAuthMessage('INVALID_GOOGLE_CREDENTIAL', lang),
          token: currentToken,
        });
        return;
      }

      isLinkingRef.current = true;
      linkRequestRef.current?.abort();
      const controller = new AbortController();
      linkRequestRef.current = controller;
      setIsLinking(true);
      setLinkFeedback(null);

      try {
        const res = await linkGoogleAccount(
          { credential, accessToken: currentToken },
          { signal: controller.signal, lang }
        );

        if (controller.signal.aborted || linkRequestRef.current !== controller) return;

        const latestSession = sessionRef.current;
        if (
          latestSession?.accessToken !== currentToken ||
          latestSession?.user?.id !== currentUserId
        ) {
          return;
        }

        setLinkedInSession(true);
        setLinkFeedback({
          type: 'success',
          message: res.message || t.googleLinkSuccess,
          token: currentToken,
        });
      } catch (err) {
        if (controller.signal.aborted || linkRequestRef.current !== controller) return;

        const latestSession = sessionRef.current;
        if (
          latestSession?.accessToken === currentToken &&
          latestSession?.user?.id === currentUserId
        ) {
          const errCode = err?.code || 'GOOGLE_LINK_FAILED';
          setLinkFeedback({
            type: 'error',
            message: err.message || getAuthMessage(errCode, lang),
            token: currentToken,
          });
        }
      } finally {
        if (linkRequestRef.current === controller) {
          linkRequestRef.current = null;
          isLinkingRef.current = false;
          setIsLinking(false);
        }
      }
    },
    [lang, t.googleLinkSuccess]
  );

  const handleGoogleError = useCallback(
    (err) => {
      const currentToken = sessionRef.current?.accessToken;
      if (!currentToken || isLinkingRef.current) return;
      const errCode = err?.code || 'GOOGLE_SCRIPT_LOAD_ERROR';
      setLinkFeedback({
        type: 'error',
        message: err.message || getAuthMessage(errCode, lang),
        token: currentToken,
      });
    },
    [lang]
  );

  const hasValidProfile = isValidUserProfile(profileUser);
  const isDevPreviewActive = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV && preview);
  const shouldRenderLayout = hasValidProfile || isDevPreviewActive;

  return (
    <div className="lv-account-profile-view">
      {/* Page Header */}
      <header className="lv-profile-header">
        <div>
          <h1 className="lv-profile-title">{t.pageTitle}</h1>
          <p className="lv-profile-subtitle">{t.pageSubtitle}</p>
        </div>

        {shouldRenderLayout && (
          <div className="lv-profile-header-actions">
            <button
              type="button"
              className="lv-profile-edit-btn"
              onClick={() => onNavigateEdit && onNavigateEdit()}
              aria-label={t.btnEditProfile}
            >
              <Edit3 size={15} aria-hidden="true" />
              <span>{t.btnEditProfile}</span>
            </button>

            <button
              type="button"
              className="lv-profile-refresh-btn"
              onClick={handleRefresh}
              disabled={!session?.accessToken || isRefreshing}
              title={!session?.accessToken ? t.unavailableNotice : undefined}
              aria-label={t.btnRefresh}
            >
              <RotateCw size={15} className={isRefreshing ? 'is-spinning' : ''} aria-hidden="true" />
              <span>{isRefreshing ? t.btnRefreshing : t.btnRefresh}</span>
            </button>
          </div>
        )}
      </header>
      {session?.accessToken && !preview && <EmailVerificationPanel session={session} lang={lang} />}

      {/* Temporary Feedback Callout */}
      {activeFeedback && (
        <div
          className={`lv-profile-feedback ${
            activeFeedback.type === 'success' ? 'lv-profile-feedback--success' : 'lv-profile-feedback--error'
          }`}
          role="status"
        >
          {activeFeedback.type === 'success' ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{activeFeedback.message}</span>
        </div>
      )}

      {/* Profile Content */}
      {shouldRenderLayout ? (
        <>
          {/* 1. Personal Identity Information */}
          <section className="lv-profile-card" aria-labelledby="personal-info-heading">
            <h2 id="personal-info-heading" className="lv-profile-card__title">
              {t.personalInfoSection}
            </h2>
            <p className="lv-profile-card__desc">{t.personalInfoDesc}</p>

            <div className="lv-profile-field-grid">
              <div className="lv-profile-field-item">
                <span className="lv-profile-field-label">{t.fullNameLabel}</span>
                <div className="lv-profile-field-value">
                  <span>{profileUser?.fullName || t.noInformation}</span>
                  <User size={16} style={{ color: '#8c734b' }} aria-hidden="true" />
                </div>
              </div>

              <div className="lv-profile-field-item">
                <span className="lv-profile-field-label">{t.emailLabel}</span>
                <div className="lv-profile-field-value">
                  <span>{profileUser?.email || t.noInformation}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {Boolean(profileUser?.email) && (
                      <span className="lv-profile-verified-badge">
                        <CheckCircle2 size={11} aria-hidden="true" />
                        <span>{t.verifiedBadge}</span>
                      </span>
                    )}
                    <Mail size={16} style={{ color: '#8c734b' }} aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 2. System Roles */}
          <section className="lv-profile-card" aria-labelledby="roles-heading">
            <h2 id="roles-heading" className="lv-profile-card__title">
              {t.rolesLabel}
            </h2>
            <p className="lv-profile-card__desc">{t.rolesDesc}</p>

            <ul className="lv-profile-roles-list" aria-label={t.rolesLabel}>
              {Array.isArray(profileUser?.roles) && profileUser.roles.length > 0 ? (
                profileUser.roles.map((role) => (
                  <li key={role} className="lv-profile-role-chip">
                    <Shield size={15} className="lv-profile-role-chip__icon" aria-hidden="true" />
                    <span>{formatRoleName(role, lang)}</span>
                  </li>
                ))
              ) : (
                <li className="lv-profile-role-chip lv-profile-role-chip--empty">
                  <Shield size={15} className="lv-profile-role-chip__icon" aria-hidden="true" />
                  <span>{t.noInformation}</span>
                </li>
              )}
            </ul>
          </section>

          {/* 3. Google Account Linking (PS-85) */}
          <section className="lv-profile-card lv-profile-google-card" aria-labelledby="google-link-heading">
            <div className="lv-profile-google-header">
              <div className="lv-profile-google-icon-badge" aria-hidden="true">
                <Link2 size={20} />
              </div>
              <div>
                <h2 id="google-link-heading" className="lv-profile-card__title">
                  {t.googleLinkSection}
                </h2>
                <p className="lv-profile-card__desc">{t.googleLinkDesc}</p>
              </div>
            </div>

            {/* Current Session Link Status */}
            <div className="lv-profile-google-status-row">
              <span className="lv-profile-field-label">{t.googleLinkSection}</span>
              <div className="lv-profile-field-value">
                {linkedInSession ? (
                  <span className="lv-profile-google-badge lv-profile-google-badge--linked">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{t.googleStatusLinkedCurrentSession}</span>
                  </span>
                ) : (
                  <span className="lv-profile-google-badge lv-profile-google-badge--unlinked">
                    <span>{t.googleStatusUnlinked}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Reload Limitation Notice */}
            <div className="lv-profile-google-limitation" role="note">
              <AlertCircle size={15} aria-hidden="true" className="lv-profile-google-limitation__icon" />
              <span>{t.googleReloadLimitationNotice}</span>
            </div>

            {/* Link Feedback Alert */}
            {activeLinkFeedback && (
              <div
                className={`lv-profile-feedback ${
                  activeLinkFeedback.type === 'success'
                    ? 'lv-profile-feedback--success'
                    : 'lv-profile-feedback--error'
                }`}
                role="status"
              >
                {activeLinkFeedback.type === 'success' ? (
                  <CheckCircle2 size={16} aria-hidden="true" />
                ) : (
                  <AlertCircle size={16} aria-hidden="true" />
                )}
                <span>{activeLinkFeedback.message}</span>
              </div>
            )}

            {/* Action Area */}
            <div className="lv-profile-google-action">
              <GoogleSignInButton
                key={`${session?.user?.id || ''}:${activeToken || ''}`}
                id="lv-profile-google-link-btn"
                disabled={isLinking || !session?.accessToken}
                lang={lang}
                text="continue_with"
                onCredentialReceived={handleGoogleCredential}
                onError={handleGoogleError}
                customUnavailableNotice={t.googleMissingClientIdNotice}
              />
              {isLinking && (
                <div className="lv-profile-google-linking-indicator" role="status">
                  <RotateCw size={14} className="is-spinning" aria-hidden="true" />
                  <span>{t.googleLinkingButtonLabel}</span>
                </div>
              )}
            </div>
          </section>
        </>
      ) : (
        /* Empty / Unavailable State (Truthful presentation when no real user data is present) */
        <div className="lv-profile-empty-card" role="status">
          <HelpCircle size={40} style={{ margin: '0 auto', opacity: 0.4 }} aria-hidden="true" />
          <h2 className="lv-profile-empty-card__title">{t.noDataTitle}</h2>
          <p className="lv-profile-empty-card__desc">{t.noDataDesc}</p>
        </div>
      )}
    </div>
  );
}
