import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import LoadingState from '../../components/common/LoadingState.jsx';
import ErrorState from '../../components/common/ErrorState.jsx';
import { AssetManagementPage } from './AssetManagementPage.jsx';
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
  if (!state.vault) return <section><p>{lang === 'en' ? 'Create your heritage vault before adding assets.' : 'Hãy tạo kho di sản trước khi thêm tài sản.'}</p><button onClick={onNavigateToVault}>{lang === 'en' ? 'Go to Vault' : 'Đến kho di sản'}</button></section>;
  return <AssetManagementPage key={state.vault.id} vaultId={state.vault.id} accessToken={accessToken} lang={lang}
    onNavigateToLogin={onUnauthorized} onRefreshTrigger={onRefreshTrigger} enforceQuota onNavigateToSubscription={onNavigateToSubscription} />;
}
