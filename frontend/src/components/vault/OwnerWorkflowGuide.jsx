import { useEffect, useState } from 'react';
import WorkflowGuide from '../common/WorkflowGuide.jsx';
import { fetchVault } from '../../utils/vaultService.js';
import { fetchVaultSummary } from '../../utils/vaultSummaryService.js';
import { willService } from '../../utils/willService.js';
import { ownerWorkflow } from '../../utils/ownerWorkflow.js';
import './OwnerWorkflowGuide.css';

export default function OwnerWorkflowGuide({ accessToken, ownerId, lang, refreshKey, route, onNavigate, onUnauthorized }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(null);
  const key = [accessToken, ownerId, lang, refreshKey, route, revision].join('|');
  useEffect(() => {
    const controller = new AbortController();
    const options = { accessToken, ownerId, lang, signal: controller.signal };
    (async () => {
      try {
        const vault = await fetchVault(options);
        let summary, wills;
        if (vault) {
          const results = await Promise.allSettled([fetchVaultSummary(vault.id, options), willService.getWills(vault.id, { ...options, size: 1 })]);
          const unauthorized = results.find(r => r.status === 'rejected' && r.reason.status === 401);
          if (unauthorized) throw unauthorized.reason;
          summary = results[0].status === 'fulfilled' ? results[0].value : undefined;
          wills = results[1].status === 'fulfilled' ? results[1].value.totalElements : undefined;
        }
        if (!controller.signal.aborted) setState({ key, vault, summary, wills });
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error.status === 401) onUnauthorized?.();
          setState({ key, error: true });
        }
      }
    })();
    return () => controller.abort();
  }, [accessToken, ownerId, lang, key, onUnauthorized]);
  const loading = state?.key !== key;
  return <div className="lv-owner-workflow">
    <WorkflowGuide title={lang === 'en' ? 'Vault setup' : 'Các bước thiết lập kho'} lang={lang}
      model={ownerWorkflow({ ...(loading ? {} : state), loading, lang })} onNavigate={onNavigate} />
    <button type="button" className="lv-owner-workflow__reload" disabled={loading} onClick={() => setRevision(n => n + 1)}>
      {lang === 'en' ? 'Reload setup status' : 'Tải lại trạng thái cấu hình'}
    </button>
  </div>;
}
