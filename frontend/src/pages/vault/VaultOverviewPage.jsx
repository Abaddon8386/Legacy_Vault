import { useState, useEffect, useCallback, useRef } from 'react';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
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


/**
 * Trang "Tổng quan Kho di sản" của chủ kho (ROLE_VAULT_OWNER). Được `App.jsx` render.
 *
 * Cách hoạt động: effect gọi `fetchVault` -> `GET /api/v1/vaults?page=0&size=20&sort=createdAt,desc` (lấy kho đầu tiên; null nếu chưa có).
 * Chưa có kho thì hiện `EmptyState` và nút mở `CreateVaultModal`; submit gọi `createVault` -> `POST /api/v1/vaults` (201) rồi hiển thị kho mới
 * và báo `onCreated`. Có kho thì hiển thị `VaultSummary` kèm sóng trang trí. Lỗi 401 gọi `onUnauthorized`; lỗi khác hiện `ErrorState` có nút thử lại.
 * Ở chế độ dev preview (`?preview=true`) có thể chọn kịch bản giả lập.
 *
 * @param {object} props
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 * @param {string} props.accessToken JWT chủ kho.
 * @param {string} [props.ownerId] ID chủ kho.
 * @param {string} [props.ownerName] Tên chủ kho hiển thị.
 * @param {Function} [props.onUnauthorized] Callback khi 401.
 * @param {boolean} [props.showDevToolbar=false] Bật thanh kịch bản thử giao diện (chỉ DEV).
 * @param {Function} [props.onNavigateToLogin] Về trang đăng nhập.
 * @param {number} [props.onRefreshTrigger] Bộ đếm làm mới từ App.
 * @param {Function} [props.onNavigate] Điều hướng sang màn khác.
 * @param {Function} [props.onCreated] Gọi sau khi tạo kho thành công.
 */
export default function VaultOverviewPage({
  lang = 'vi',
  accessToken,
  ownerId,
  ownerName,
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

  /**
   * Thử lại tải kho: bật loading và tăng `refreshKey` để effect chạy lại.
   */
  const handleManualRetry = useCallback(() => {
    setLoading(true);
    setRefreshKey((k) => k + 1);
  }, []);

  /**
   * Tạo kho từ form modal qua `createVault` (`POST /api/v1/vaults`); 401 gọi `onUnauthorized`, lỗi khác được ném lại cho modal hiển thị.
   * Thành công thì cập nhật kho, gọi `onCreated`, đóng modal và hiện thông báo 4 giây.
   *
   * @param {{vault_name?: string, name?: string, description?: string}} formData Dữ liệu từ form.
   */
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

  /**
   * Chuỗi giao diện song ngữ của trang tổng quan kho.
   */
  const content = {
    vi: {
      overviewEyebrow: 'KHO DI SẢN SỐ',
      createdLabel: 'Khởi tạo:',
      ownerRoleLabel: 'Chủ sở hữu:',
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
        <FeedbackNotice className="lv-feedback--floating" tone="success">{notification}</FeedbackNotice>
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
                {ownerName && <div className="lv-meta-item">
                  <span className="lv-meta-label">{t.ownerRoleLabel}</span>
                  <span className="lv-meta-value">{ownerName}</span>
                </div>}

              </div>
            </div>

            {/* Right Column: Living Heritage Wave Artwork Panel (Scoped interactive physics) */}
            <div className="lv-hero-artwork-col">
              <LivingHeritageWave status={vault.status || 'ACTIVE'} lang={lang} />
            </div>
          </section>

          {/* 1:1 Ownership Policy Footnote — Quiet, balanced editorial policy */}
          {/* Overview Resource & Operational Summary */}
          <VaultSummary onNavigate={onNavigate} vaultId={vault.id} vaultStatus={vault.status} ownerId={ownerId} accessToken={accessToken} lang={lang} onUnauthorized={onUnauthorized} refreshKey={onRefreshTrigger} isSimulation={vault.isSimulation} />
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
