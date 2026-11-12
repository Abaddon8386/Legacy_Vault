import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import VaultRequiredState from '../../components/common/VaultRequiredState.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import { AssetManagementPage } from './AssetManagementPage.jsx';
/**
 * Route màn "Tài sản" của chủ kho (ROLE_VAULT_OWNER). Tải kho của chủ sở hữu bằng `fetchVault` -> `GET /api/v1/vaults?page=0&size=20&sort=createdAt,desc`
 * rồi hiển thị: `LoadingState` khi đang tải, `ErrorState` khi lỗi, `VaultRequiredState` khi chưa có kho, ngược lại `AssetManagementPage`
 * với `vaultId` (chỉ đọc nếu kho không ở trạng thái ACTIVE) và bật kiểm tra hạn mức (`enforceQuota`). Lỗi 401 gọi `onUnauthorized`.
 *
 * @param {object} props
 * @param {string} props.accessToken JWT chủ kho.
 * @param {'vi'|'en'} props.lang Ngôn ngữ.
 * @param {Function} props.onUnauthorized Callback khi 401.
 * @param {Function} props.onNavigateToVault Đi tới trang kho.
 * @param {Function} props.onNavigateToSubscription Đi tới trang gói sử dụng khi hết hạn mức.
 * @param {number} props.onRefreshTrigger Bộ đếm làm mới từ App.
 */
export default function AssetsRoute({ accessToken, lang, onUnauthorized, onNavigateToVault, onNavigateToSubscription, onRefreshTrigger }) {
  const [state, setState] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    fetchVault({ accessToken, lang, signal: controller.signal }).then(vault => {
      if (active) setState({ vault });
    }).catch(error => {
      if (!active || error.name === 'AbortError') return;
      if (error.status === 401) { onUnauthorized?.(); return; }
      setState({ error });
    });
    return () => { active = false; controller.abort(); };
  }, [accessToken, lang, onUnauthorized, onRefreshTrigger]);
  if (state.loading) return <LoadingState lang={lang} />;
  if (state.error) return <ErrorState error={state.error} lang={lang} onRetry={onNavigateToVault} onNavigateToLogin={onUnauthorized} />;
  if (!state.vault) return <VaultRequiredState kind="assets" lang={lang} onNavigateToVault={onNavigateToVault} />;
  return <AssetManagementPage key={state.vault.id} vaultId={state.vault.id} readOnly={state.vault.status !== 'ACTIVE'} accessToken={accessToken} lang={lang}
    onNavigateToLogin={onUnauthorized} onRefreshTrigger={onRefreshTrigger} enforceQuota onNavigateToSubscription={onNavigateToSubscription} />;
}
