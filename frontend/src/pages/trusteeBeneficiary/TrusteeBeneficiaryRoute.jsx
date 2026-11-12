import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import VaultRequiredState from '../../components/common/VaultRequiredState.jsx';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import TrusteeBeneficiaryPage from './TrusteeBeneficiaryPage.jsx';

/**
 * Route màn hình Người thi hành bên ngoài và Người thụ hưởng của chủ kho (App.jsx render tại /beneficiaries).
 * Tải kho của chủ sở hữu bằng fetchVault (GET /api/v1/vault) rồi quyết định: đang tải -> LoadingState; lỗi -> ErrorState (401 -> onUnauthorized); chưa có kho -> VaultRequiredState;
 * có kho -> TrusteeBeneficiaryPage. Chế độ xem trước DEV chỉ bật khi không có accessToken. Có AbortController và cờ active để hủy khi props đổi hoặc unmount.
 *
 * @param {object} props
 * @param {string} props.accessToken JWT.
 * @param {'vi'|'en'} props.lang Ngôn ngữ.
 * @param {() => void} props.onUnauthorized Gọi khi 401.
 * @param {() => void} props.onNavigateToVault Chuyển tới màn hình kho.
 * @param {*} props.onRefreshTrigger Giá trị đổi để ép tải lại.
 * @param {boolean} [props.isDevPreview=false] Cho phép dữ liệu mẫu trong DEV khi chưa đăng nhập.
 * @param {Function} [props.onLoadInvitation] Hàm tải mã mời của người thụ hưởng (invitationActions.loadForBeneficiary).
 * @returns {JSX.Element}
 */
export default function TrusteeBeneficiaryRoute({
  accessToken,
  lang,
  onUnauthorized,
  onNavigateToVault,
  onRefreshTrigger,
  isDevPreview = false,
  onLoadInvitation,
}) {
  const isAuthenticated = Boolean(accessToken && typeof accessToken === 'string' && accessToken.trim().length > 0);
  const effectiveDevPreview = Boolean(import.meta.env?.DEV && !isAuthenticated && isDevPreview);

  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    fetchVault({ accessToken, lang, signal: controller.signal, isDevPreview: effectiveDevPreview })
      .then((vault) => {
        if (active) setState({ vault });
      })
      .catch((error) => {
        if (!active || error.name === 'AbortError') return;
        if (error.status === 401) {
          onUnauthorized?.();
          return;
        }
        setState({ error });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [accessToken, lang, onUnauthorized, onRefreshTrigger, effectiveDevPreview]);

  if (state.loading) return <LoadingState lang={lang} />;
  if (state.error) {
    return (
      <ErrorState
        error={state.error}
        lang={lang}
        onRetry={onNavigateToVault}
        onNavigateToLogin={onUnauthorized}
      />
    );
  }
  if (!state.vault) return <VaultRequiredState kind="beneficiaries" lang={lang} onNavigateToVault={onNavigateToVault} />;
  return (
    <TrusteeBeneficiaryPage
      key={state.vault.id}
      vaultId={state.vault.id}
      accessToken={accessToken}
      lang={lang}
      onUnauthorized={onUnauthorized}
      onRefreshTrigger={onRefreshTrigger}
      isDevPreview={effectiveDevPreview}
      onLoadInvitation={onLoadInvitation}
    />
  );
}
