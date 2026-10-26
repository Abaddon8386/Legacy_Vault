import AppShell from './AppShell.jsx';

export default function StaffShell({ children, lang = 'vi', onToggleLang, onLogout,
  onRefresh, isRefreshing = false, currentTab = 'cases', onNavigateTab,
  onNavigateCases, onNavigateLegalDocuments, onNavigateAssetHandover,
  onNavigateCloseAndArchive, onNavigateCompletionProgress, onNavigateBeneficiaryConfirmation,
  onNavigateProfile, onNavigateAccountEdit, session = null, user = null }) {
  const routes = {
    cases: onNavigateCases, 'legal-documents': onNavigateLegalDocuments,
    'asset-handover': onNavigateAssetHandover, 'close-and-archive': onNavigateCloseAndArchive,
    'completion-progress': onNavigateCompletionProgress,
    'beneficiary-confirmation': onNavigateBeneficiaryConfirmation,
    'account-profile': onNavigateProfile, 'account-edit': onNavigateAccountEdit,
  };
  return <div className="lv-staff-shell">
    <AppShell role="STAFF" session={session} user={user} currentTab={currentTab || 'cases'}
      lang={lang} onToggleLang={onToggleLang} onLogout={onLogout} onRefresh={onRefresh}
      isRefreshing={isRefreshing} onNavigateTab={tab => {
        if (routes[tab]) routes[tab](); else onNavigateTab?.(tab);
      }}>
      {children}
    </AppShell>
  </div>;
}