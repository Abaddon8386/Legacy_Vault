import { useEffect, useState } from 'react';
import { fetchVault } from '../../utils/vaultService.js';
import VaultRequiredState from '../../components/common/VaultRequiredState.jsx';
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
  if (!state.vault) return <VaultRequiredState kind="assets" lang={lang} onNavigateToVault={onNavigateToVault} />;
  return <AssetManagementPage key={state.vault.id} vaultId={state.vault.id} readOnly={state.vault.status !== 'ACTIVE'} accessToken={accessToken} lang={lang}
    onNavigateToLogin={onUnauthorized} onRefreshTrigger={onRefreshTrigger} enforceQuota onNavigateToSubscription={onNavigateToSubscription} />;
}
