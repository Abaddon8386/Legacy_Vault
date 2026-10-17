import { useState } from 'react';
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
import { formatRoleName, isValidUserProfile } from '../../utils/accountProfileValidation.js';
import { accountProfileI18n } from './accountProfileI18n.js';
import './AccountProfilePage.css';

export default function AccountProfilePage({
  session = null,
  lang = 'vi',
  onRefreshSession,
}) {
  const t = accountProfileI18n[lang] || accountProfileI18n.vi;

  const [refreshedUser, setRefreshedUser] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState(null);

  const profileUser = refreshedUser || session?.user || null;

  // Fetch fresh profile from GET /auth/me
  const handleRefresh = async () => {
    if (!session?.accessToken) {
      return;
    }

    setIsRefreshing(true);
    setFeedback(null);

    try {
      const raw = await request('/auth/me', {
        accessToken: session.accessToken,
        lang,
      });
      const validatedUser = readUser(raw);
      setRefreshedUser(validatedUser);
      setFeedback({ type: 'success', message: t.refreshSuccess });

      if (typeof onRefreshSession === 'function') {
        onRefreshSession(validatedUser);
      }
    } catch {
      // Graceful fallback: maintain cached session user without breaking
      setFeedback({ type: 'error', message: t.refreshError });
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasValidProfile = isValidUserProfile(profileUser);

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

        {hasValidProfile && session?.accessToken && (
          <button
            type="button"
            className="lv-profile-refresh-btn"
            onClick={handleRefresh}
            disabled={isRefreshing}
            aria-label={t.btnRefresh}
          >
            <RotateCw size={15} className={isRefreshing ? 'is-spinning' : ''} aria-hidden="true" />
            <span>{isRefreshing ? t.btnRefreshing : t.btnRefresh}</span>
          </button>
        )}
      </header>

      {/* Temporary Feedback Callout */}
      {feedback && (
        <div
          className={`lv-profile-feedback ${
            feedback.type === 'success' ? 'lv-profile-feedback--success' : 'lv-profile-feedback--error'
          }`}
          role="status"
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 size={16} aria-hidden="true" />
          ) : (
            <AlertCircle size={16} aria-hidden="true" />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Profile Content */}
      {hasValidProfile ? (
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
                  <span>{profileUser.fullName}</span>
                  <User size={16} style={{ color: '#8c734b' }} aria-hidden="true" />
                </div>
              </div>

              <div className="lv-profile-field-item">
                <span className="lv-profile-field-label">{t.emailLabel}</span>
                <div className="lv-profile-field-value">
                  <span>{profileUser.email}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span className="lv-profile-verified-badge">
                      <CheckCircle2 size={11} aria-hidden="true" />
                      <span>{t.verifiedBadge}</span>
                    </span>
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
              {profileUser.roles.map((role) => (
                <li key={role} className="lv-profile-role-chip">
                  <Shield size={15} className="lv-profile-role-chip__icon" aria-hidden="true" />
                  <span>{formatRoleName(role, lang)}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* 3. Session Status */}
          {session && (
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
          )}
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
