import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import TrusteeBeneficiaryPage from './TrusteeBeneficiaryPage.jsx';

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
  if (!state.vault) {
    return (
      <section>
        <p>
          {lang === 'en'
            ? 'Create your heritage vault before adding trustees or beneficiaries.'
            : 'Hãy tạo kho di sản trước khi khai báo người thi hành bên ngoài và người thụ hưởng.'}
        </p>
        <button onClick={onNavigateToVault}>{lang === 'en' ? 'Go to Vault' : 'Đến kho di sản'}</button>
      </section>
    );
  }
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
