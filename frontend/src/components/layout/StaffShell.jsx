import AppShell from './AppShell.jsx';

/**
 * Khung giao diện cho vai trò nhân viên (STAFF_EXECUTOR): bọc {@code AppShell role="STAFF"}. Ánh xạ tab sang các callback điều hướng riêng
 * (cases, legal-documents, asset-handover, close-and-archive, beneficiary-confirmation, account-profile, account-edit); tab không có callback thì gọi {@code onNavigateTab}.
 * Dùng bởi các trang staff trong {@code App.jsx}.
 *
 * Props: {@code children}, {@code lang}, {@code onToggleLang}, {@code onLogout}, {@code onRefresh}, {@code isRefreshing}, {@code currentTab}, {@code onNavigateTab}, các {@code onNavigate*}, {@code session}, {@code user}.
 */
export default function StaffShell({ children, lang = 'vi', onToggleLang, onLogout,
  onRefresh, isRefreshing = false, currentTab = 'cases', onNavigateTab,
  onNavigateCases, onNavigateLegalDocuments, onNavigateAssetHandover,
  onNavigateCloseAndArchive, onNavigateBeneficiaryConfirmation,
  onNavigateProfile, onNavigateAccountEdit, session = null, user = null }) {
  const routes = {
    cases: onNavigateCases, 'legal-documents': onNavigateLegalDocuments,
    'asset-handover': onNavigateAssetHandover, 'close-and-archive': onNavigateCloseAndArchive,
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