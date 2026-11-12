import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import VaultRequiredState from '../../components/common/VaultRequiredState.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import WillUploadPage from './WillUploadPage.jsx';
/**
 * Route cho màn hình Di chúc của chủ kho (App.jsx render). Tải kho của chủ sở hữu bằng fetchVault (GET /api/v1/vault) rồi quyết định:
 * đang tải -> LoadingState; lỗi -> ErrorState (401 -> onUnauthorized); chưa có kho -> VaultRequiredState; có kho -> WillUploadPage (chỉ đọc nếu kho không ACTIVE).
 * Có AbortController và cờ active để hủy khi props đổi hoặc unmount; tải lại khi onRefreshTrigger đổi.
 *
 * @param {object} props
 * @param {string} props.accessToken JWT.
 * @param {'vi'|'en'} props.lang Ngôn ngữ.
 * @param {() => void} props.onUnauthorized Gọi khi 401.
 * @param {() => void} props.onNavigateToVault Chuyển tới màn hình kho.
 * @param {*} props.onRefreshTrigger Giá trị thay đổi để ép tải lại.
 * @returns {JSX.Element}
 */
export default function WillsRoute({ accessToken, lang, onUnauthorized, onNavigateToVault, onRefreshTrigger }) {
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
  if (!state.vault) return <VaultRequiredState kind="wills" lang={lang} onNavigateToVault={onNavigateToVault} />;
  return <WillUploadPage key={state.vault.id} vaultId={state.vault.id} readOnly={state.vault.status !== 'ACTIVE'} vaultStatus={state.vault.status} accessToken={accessToken} lang={lang}
    onUnauthorized={onUnauthorized} onRefreshTrigger={onRefreshTrigger} />;
}
