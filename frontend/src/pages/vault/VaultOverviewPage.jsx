import { useState, useEffect, useCallback, useRef } from 'react';
import {
  fetchVault,
  createVault,

} from '../../utils/vaultService.js';
import EmptyState from '../../components/common/EmptyState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import CreateVaultModal from '../../components/vault/CreateVaultModal.jsx';
import LivingHeritageWave from '../../components/vault/LivingHeritageWave.jsx';
import VaultSummary from '../../components/vault/VaultSummary.jsx';
import './VaultOverviewPage.css';


export default function VaultOverviewPage({
  lang = 'vi',
  accessToken,
  ownerId,
  onUnauthorized,
  showDevToolbar = false,
  onNavigateToLogin,
  onRefreshTrigger,
  onNavigate,
  onCreated,
}) {
  const [vault, setVault] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedScenario, setSelectedScenario] = useState('exists');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [notification, setNotification] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const createControllerRef = useRef(null);
  useEffect(() => () => createControllerRef.current?.abort(), []);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();
    const isDevPreviewActive = Boolean(import.meta.env.DEV && showDevToolbar);
    const scenario = isDevPreviewActive ? selectedScenario : undefined;

    fetchVault({ scenario, isDevPreview: isDevPreviewActive, lang, accessToken, signal: controller.signal })
      .then((data) => {
        if (!ignore) {
          setVault(data);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore && err.name !== 'AbortError') {
          if (err.status === 401) { onUnauthorized?.(); return; }
          setError(err);
          setVault(null);
          setLoading(false);
        }
      });

    return () => {
      ignore = true; controller.abort();
    };
  }, [showDevToolbar, selectedScenario, lang, onRefreshTrigger, refreshKey, accessToken, onUnauthorized]);

  const handleManualRetry = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  const handleCreateVaultSubmit = async (formData) => {
    const isDevPreviewActive = Boolean(import.meta.env.DEV && showDevToolbar);
    const scenario = isDevPreviewActive
      ? (selectedScenario === 'network_error' || selectedScenario === 'forbidden' ? selectedScenario : 'success')
      : undefined;
    const controller = new AbortController(); createControllerRef.current = controller;
    let created;
    try { created = await createVault(formData, {
      isDevPreview: isDevPreviewActive,
      scenario,
      lang, accessToken, signal: controller.signal,
    }); } catch (error) {
      if (error.status === 401) onUnauthorized?.();
      throw error;
    }
    if (controller.signal.aborted) return;
    setVault(created);
    onCreated?.();
    if (isDevPreviewActive) {
      setSelectedScenario('exists');
    }
    setIsModalOpen(false);
    setNotification(
      lang === 'en'
        ? 'Heritage vault initialized successfully.'
        : 'Kho di sản số đã được khởi tạo thành công.'
    );
    setTimeout(() => setNotification(''), 4000);
  };

  const content = {
    vi: {
      overviewEyebrow: 'KHO DI SẢN SỐ',
      createdLabel: 'Khởi tạo:',
      ownerRoleLabel: 'Chủ sở hữu:',
      ownerRoleVal: 'Chủ sở hữu cá nhân',
      overviewHeading: 'Tổng quan Kho di sản',
      statusHeading: 'Trạng thái vận hành:',
      createAnotherNotice:
        'Chính sách hệ thống: Mỗi tài khoản chỉ sở hữu duy nhất 01 kho di sản số cá nhân.',
      scenarioSelectLabel: 'Kịch bản kiểm thử giao diện:',
      scenarioNotice:
        'Công cụ hỗ trợ kiểm thử các trạng thái giao diện trong môi trường phát triển (?preview=true).',
    },
    en: {
      overviewEyebrow: 'HERITAGE VAULT',
      createdLabel: 'Initialized:',
      ownerRoleLabel: 'Ownership:',
      ownerRoleVal: 'Personal Vault Owner',
      overviewHeading: 'Heritage Sanctuary Overview',
      statusHeading: 'Operational Status:',
      createAnotherNotice:
        'System policy: Each account is permitted strictly one personal digital heritage vault.',
      scenarioSelectLabel: 'UI Test Scenario:',
      scenarioNotice:
        'Development utility for reviewing interface states (?preview=true).',
    },
  };

  const t = content[lang] || content.vi;

  return (
    <div className="lv-vault-page">
      {/* Notification Toast */}
      {notification && (
        <div className="lv-toast-alert" role="status" aria-live="polite">
          <span className="lv-toast-check" aria-hidden="true">✓</span>
          <span>{notification}</span>
        </div>
      )}

      {/* Dynamic View States */}
      {loading ? (
        <div className="lv-vault-skeleton" role="status" aria-live="polite" aria-busy="true">
          <span>{lang === 'en' ? 'Loading your vault…' : 'Đang tải thông tin kho…'}</span>
          <div aria-hidden="true" /><div aria-hidden="true" />
        </div>
      ) : error ? (
        <ErrorState
          error={error}
          lang={lang}
          onRetry={handleManualRetry}
          onNavigateToLogin={onNavigateToLogin}
          onCreateVault={() => {
            setSelectedScenario('create_modal');
            setIsModalOpen(true);
          }}
        />
      ) : !vault ? (
        <EmptyState
          lang={lang}
          onCreateVault={() => {
            setSelectedScenario('create_modal');
            setIsModalOpen(true);
          }}
        />
      ) : (
        /* Vault Exists: Rich Editorial Sanctuary Centerpiece */
        <div className="lv-vault-view">
          {/* Main Heritage Sanctuary Hero Banner */}
          <section
            className="lv-vault-hero-card lv-owner-card"
            aria-label={lang === 'en' ? 'Vault information' : 'Thông tin kho di sản'}
          >
            {/* Background Decorative Spotlight Layer — strictly background (z-index: 0, pointer-events: none) */}

            {/* Left Column: Core Editorial Metadata (z-index: 2, crisp text and badges) */}
            <div className="lv-hero-content-col">
              <div className="lv-hero-top-row">
                <div className="lv-hero-eyebrow-wrap">
                  <span className="lv-hero-eyebrow">{t.overviewEyebrow}</span>
                  {vault.isSimulation && (
                    <span className="lv-sim-tag">
                      {lang === 'en' ? 'Sample data' : 'Dữ liệu minh họa'}
                    </span>
                  )}
                </div>
              </div>

              <h1 className="lv-vault-name">{vault.vault_name || vault.name}</h1>

              {/* Metadata Badges Bar */}
              <div className="lv-vault-meta-grid">
                <div className="lv-meta-item">
                  <span className="lv-meta-label">{t.createdLabel}</span>
                  <span className="lv-meta-value">
                    {vault.created_at
                      ? new Date(vault.created_at).toLocaleDateString(
                          lang === 'vi' ? 'vi-VN' : 'en-US',
                          { year: 'numeric', month: 'long', day: 'numeric' }
                        )
                      : (lang === 'en' ? 'Not recorded' : 'Chưa ghi nhận')}
                  </span>
                </div>
                <div className="lv-meta-item">
                  <span className="lv-meta-label">{t.ownerRoleLabel}</span>
                  <span className="lv-meta-value">{t.ownerRoleVal}</span>
                </div>

              </div>
            </div>

            {/* Right Column: Living Heritage Wave Artwork Panel (Scoped interactive physics) */}
            <div className="lv-hero-artwork-col">
              <LivingHeritageWave status={vault.status || 'ACTIVE'} lang={lang} />
            </div>
          </section>

          {/* 1:1 Ownership Policy Footnote — Quiet, balanced editorial policy */}
          {/* Overview Resource & Operational Summary */}
          <VaultSummary onNavigate={onNavigate} vaultId={vault.id} ownerId={ownerId} accessToken={accessToken} lang={lang} onUnauthorized={onUnauthorized} refreshKey={onRefreshTrigger} isSimulation={vault.isSimulation} />
        </div>
      )}

      {/* Create Vault Dialog Modal */}
      <CreateVaultModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          if (selectedScenario === 'create_modal' || selectedScenario === 'validation_error') {
            setSelectedScenario(vault ? 'exists' : 'empty');
          }
        }}
        onSubmitVault={handleCreateVaultSubmit}
        lang={lang}
        initialShowErrors={selectedScenario === 'validation_error'}
      />
    </div>
  );
}
