import { useState, useRef, useEffect } from 'react';
import {
  User,
  Mail,
  Shield,
  Clock,
  RotateCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
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
import './AccountProfilePage.css';

export default function AccountProfilePage({
  session = null,
  lang = 'vi',
  onRefreshSession,
  preview = false,
}) {
  const t = accountProfileI18n[lang] || accountProfileI18n.vi;

  const sessionRef = useRef(session);
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  const [refreshedData, setRefreshedData] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const profileUser = resolveActiveProfileUser(refreshedData, session);
  const activeToken = session?.accessToken || null;
  const activeFeedback = feedback?.token === activeToken ? feedback : null;

  // Fetch fresh profile from GET /auth/me
  const handleRefresh = async () => {
    const currentToken = sessionRef.current?.accessToken;
    const currentUserId = sessionRef.current?.user?.id;

    if (!currentToken || !currentUserId) {
      return;
    }

    setIsRefreshing(true);
    setFeedback(null);

    try {
      const raw = await request('/auth/me', {
        accessToken: currentToken,
        lang,
      });
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
        onRefreshSession(validatedUser);
      }
    } catch {
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
      setIsRefreshing(false);
    }
  };

  const hasValidProfile = isValidUserProfile(profileUser);
  const isDevPreviewActive = Boolean(typeof import.meta !== 'undefined' && import.meta.env?.DEV && preview);
  const shouldRenderLayout = hasValidProfile || isDevPreviewActive;

  // Format expiration timestamp
  const formatExpiresAt = (expiresAt) => {
    if (!expiresAt || typeof expiresAt !== 'number') {
      return '-';
    }
    const d = new Date(expiresAt);
    return d.toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  return (
    <div className="lv-account-profile-view">
      {/* Page Header */}
      <header className="lv-profile-header">
        <div>
          <h1 className="lv-profile-title">{t.pageTitle}</h1>
          <p className="lv-profile-subtitle">{t.pageSubtitle}</p>
        </div>

        {shouldRenderLayout && (
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
        )}
      </header>

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

          {/* 3. Session Status */}
          {session ? (
            <section className="lv-profile-card" aria-labelledby="session-info-heading">
              <h2 id="session-info-heading" className="lv-profile-card__title">
                {t.sessionStatusSection}
              </h2>

              <div className="lv-profile-session-grid">
                <div className="lv-profile-session-box">
                  <span className="lv-profile-session-box__label">{t.sessionActiveLabel}</span>
                  <span className="lv-profile-session-box__value">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{lang === 'en' ? 'Active' : 'Đang hoạt động'}</span>
                  </span>
                </div>

                <div className="lv-profile-session-box">
                  <span className="lv-profile-session-box__label">{t.sessionExpiresLabel}</span>
                  <span className="lv-profile-session-box__value" style={{ color: '#555555' }}>
                    <Clock size={14} aria-hidden="true" />
                    <span>{formatExpiresAt(session.expiresAt)}</span>
                  </span>
                </div>
              </div>
            </section>
          ) : isDevPreviewActive ? (
            <section className="lv-profile-card" aria-labelledby="session-info-heading">
              <h2 id="session-info-heading" className="lv-profile-card__title">
                {t.sessionStatusSection}
              </h2>

              <div className="lv-profile-session-grid">
                <div className="lv-profile-session-box">
                  <span className="lv-profile-session-box__label">{t.sessionActiveLabel}</span>
                  <span className="lv-profile-session-box__value" style={{ color: '#606863' }}>
                    <span>{t.noInformation}</span>
                  </span>
                </div>

                <div className="lv-profile-session-box">
                  <span className="lv-profile-session-box__label">{t.sessionExpiresLabel}</span>
                  <span className="lv-profile-session-box__value" style={{ color: '#606863' }}>
                    <span>{t.noInformation}</span>
                  </span>
                </div>
              </div>
            </section>
          ) : null}
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
