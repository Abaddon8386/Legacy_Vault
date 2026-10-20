import { useState } from 'react';
import {
  ShieldCheck,
  User,
  AlertCircle,
  FileCheck2,
  Clock,
  PhoneCall,
  ExternalLink,
  RotateCcw,
  LogOut,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import './BeneficiaryHome.css';

/**
 * Beneficiary Landing Page — PS-90
 * Provides the official landing destination for authenticated Beneficiary accounts.
 * Conforms strictly to contract rules:
 * - Invitation codes only link accounts; they do NOT grant asset visibility or confirm handover.
 * - No fake secret vaults, guest portals, remote OTPs, or self-service confirmation buttons.
 * - Outlines the mandatory counter verification and handover steps with Staff.
 * - Supports multi-role users with appropriate portal switchers.
 * - Completely avoids fabricated contacts, fake addresses, unconfirmed ACTIVE statuses, or speculative legal phrases.
 */
export default function BeneficiaryHome({
  lang = 'vi',
  user = null,
  session = null,
  onOpenProfile,
  onOpenEditProfile,
  onNavigatePortal,
  onLogout,
  onRefresh,
  isRefreshing = false,
  isLoading = false,
  errorMessage = null,
}) {
  const en = lang === 'en';
  const currentUser = user || session?.user || null;
  const roles = Array.isArray(currentUser?.roles) ? currentUser.roles : [];

  const [localError, setLocalError] = useState(null);

  const isVaultOwner = roles.includes('VAULT_OWNER');
  const isStaff = roles.includes('STAFF_EXECUTOR');
  const isLegal = roles.includes('LEGAL_VERIFIER');
  const isAdmin = roles.includes('ADMIN');

  if (isLoading || isRefreshing) {
    return (
      <main className="lv-ben-home" role="status" aria-live="polite">
        <div className="lv-ben-loading">
          <Clock className="lv-spinning" size={32} style={{ margin: '0 auto 12px' }} />
          <p>{en ? 'Loading beneficiary information...' : 'Đang tải thông tin người thụ hưởng...'}</p>
        </div>
      </main>
    );
  }

  if (errorMessage || localError) {
    return (
      <main className="lv-ben-home" role="alert">
        <div className="lv-ben-error">
          <AlertCircle size={36} style={{ margin: '0 auto 12px', color: '#b91c1c' }} />
          <h2 className="lv-ben-error__title">{en ? 'Information Unavailable' : 'Thông tin tạm thời chưa khả dụng'}</h2>
          <p className="lv-ben-error__desc">
            {errorMessage || localError || (en ? 'Unable to load account details from server.' : 'Không thể tải thông tin tài khoản từ máy chủ.')}
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            {onRefresh && (
              <button
                type="button"
                className="lv-ben-btn lv-ben-btn-primary"
                onClick={() => {
                  setLocalError(null);
                  onRefresh();
                }}
              >
                <RotateCcw size={15} />
                <span>{en ? 'Retry' : 'Thử lại'}</span>
              </button>
            )}
            {onLogout && (
              <button type="button" className="lv-ben-btn lv-ben-btn-secondary" onClick={onLogout}>
                <LogOut size={15} />
                <span>{en ? 'Sign out' : 'Đăng xuất'}</span>
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="lv-ben-home" aria-labelledby="beneficiary-home-title">
      {/* Page Header */}
      <header className="lv-ben-header">
        <div className="lv-ben-badge">
          <ShieldCheck size={14} aria-hidden="true" />
          <span>{en ? 'Beneficiary Portal' : 'Cổng Người Thụ Hưởng'}</span>
        </div>
        <h1 id="beneficiary-home-title" className="lv-ben-title">
          {en ? 'Beneficiary Information' : 'Thông tin dành cho Người thụ hưởng'}
        </h1>
        <p className="lv-ben-sub">
          {en
            ? 'You are signed in with a Beneficiary role account in LegacyVault.'
            : 'Bạn đang đăng nhập bằng tài khoản có vai trò Người thụ hưởng trong hệ thống LegacyVault.'}
        </p>
      </header>

      {/* Multi-role Navigation Switcher (when account has multiple roles) */}
      {(isVaultOwner || isStaff || isLegal || isAdmin) && (
        <section className="lv-ben-multirole" aria-label={en ? 'Multi-role portal access' : 'Lối vào các cổng theo vai trò'}>
          <div className="lv-ben-multirole__info">
            <h2 className="lv-ben-multirole__title">
              {en ? 'Additional Account Roles Detected' : 'Tài khoản có nhiều vai trò hoạt động'}
            </h2>
            <p className="lv-ben-multirole__desc">
              {en
                ? 'Your account holds privileges across multiple portals. You can switch to your primary workspaces at any time while preserving current credentials.'
                : 'Tài khoản của bạn sở hữu các quyền hạn khác nhau. Bạn có thể chuyển đổi sang các cổng quản trị tương ứng bất kỳ lúc nào.'}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {isVaultOwner && (
              <button
                type="button"
                className="lv-ben-btn lv-ben-btn-primary"
                onClick={() => onNavigatePortal?.('/vault')}
                title={en ? 'Switch to Personal Heritage Vault' : 'Chuyển sang Kho di sản cá nhân'}
              >
                <ExternalLink size={14} />
                <span>{en ? 'Heritage Vault' : 'Kho di sản'}</span>
              </button>
            )}
            {isStaff && (
              <button
                type="button"
                className="lv-ben-btn lv-ben-btn-secondary"
                onClick={() => onNavigatePortal?.('/staff/cases')}
                title={en ? 'Switch to Staff Executor Portal' : 'Chuyển sang Cổng Nhân viên'}
              >
                <ExternalLink size={14} />
                <span>{en ? 'Staff Portal' : 'Cổng Nhân viên'}</span>
              </button>
            )}
            {isLegal && (
              <button
                type="button"
                className="lv-ben-btn lv-ben-btn-secondary"
                onClick={() => onNavigatePortal?.('/legal/death-verification')}
                title={en ? 'Switch to Legal Verification Portal' : 'Chuyển sang Cổng Pháp lý'}
              >
                <ExternalLink size={14} />
                <span>{en ? 'Legal Portal' : 'Cổng Pháp lý'}</span>
              </button>
            )}
            {isAdmin && (
              <button
                type="button"
                className="lv-ben-btn lv-ben-btn-secondary"
                onClick={() => onNavigatePortal?.('/admin')}
                title={en ? 'Switch to Administration' : 'Chuyển sang Quản trị'}
              >
                <ExternalLink size={14} />
                <span>{en ? 'Admin Portal' : 'Cổng Quản trị'}</span>
              </button>
            )}
          </div>
        </section>
      )}

      {/* Account Info Card */}
      <section className="lv-ben-card" aria-label={en ? 'Account details' : 'Chi tiết tài khoản'}>
        <div className="lv-ben-card__title-row">
          <h2 className="lv-ben-card__title">
            <User size={20} aria-hidden="true" />
            <span>{en ? 'Official Account Profile' : 'Hồ sơ tài khoản đăng nhập'}</span>
          </h2>
          {Boolean(currentUser?.status) && (
            <span className={`lv-ben-status-badge ${currentUser.status === 'ACTIVE' ? 'lv-ben-status-badge--active' : ''}`}>
              {currentUser.status === 'ACTIVE' && (
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#2e7d32' }} aria-hidden="true" />
              )}
              <span>{currentUser.status === 'ACTIVE' ? (en ? 'Active' : 'Đang hoạt động') : currentUser.status}</span>
            </span>
          )}
        </div>

        <div className="lv-ben-details-grid">
          <div className="lv-ben-detail-item">
            <span className="lv-ben-detail-label">{en ? 'Full Name' : 'Họ và tên'}</span>
            <span className="lv-ben-detail-val">{currentUser?.fullName || (en ? 'Beneficiary' : 'Người thụ hưởng')}</span>
          </div>

          <div className="lv-ben-detail-item">
            <span className="lv-ben-detail-label">{en ? 'Registered Email' : 'Email đăng nhập'}</span>
            <span className="lv-ben-detail-val">{currentUser?.email || '—'}</span>
          </div>

          <div className="lv-ben-detail-item">
            <span className="lv-ben-detail-label">{en ? 'Phone Number' : 'Số điện thoại'}</span>
            <span className="lv-ben-detail-val">{currentUser?.phoneNumber || (en ? 'Information unavailable' : 'Thông tin chưa khả dụng')}</span>
          </div>

          <div className="lv-ben-detail-item">
            <span className="lv-ben-detail-label">{en ? 'Assigned Role' : 'Vai trò hệ thống'}</span>
            <span className="lv-ben-detail-val">{en ? 'Beneficiary' : 'Người thụ hưởng'}</span>
          </div>
        </div>

        <div className="lv-ben-actions">
          {onOpenProfile && (
            <button type="button" className="lv-ben-btn lv-ben-btn-primary" onClick={onOpenProfile}>
              <User size={15} />
              <span>{en ? 'View account profile' : 'Xem hồ sơ tài khoản'}</span>
            </button>
          )}

          {onOpenEditProfile && (
            <button type="button" className="lv-ben-btn lv-ben-btn-secondary" onClick={onOpenEditProfile}>
              <Edit3 size={15} />
              <span>{en ? 'Edit Profile' : 'Chỉnh sửa thông tin'}</span>
            </button>
          )}

          {onRefresh && (
            <button
              type="button"
              className="lv-ben-btn lv-ben-btn-secondary"
              onClick={onRefresh}
              disabled={isRefreshing}
              title={en ? 'Refresh Account & Privileges' : 'Làm mới thông tin & quyền'}
            >
              <RefreshCw size={15} className={isRefreshing ? 'lv-spinning' : ''} />
              <span>{isRefreshing ? (en ? 'Refreshing...' : 'Đang làm mới...') : (en ? 'Refresh' : 'Làm mới')}</span>
            </button>
          )}

          {onLogout && (
            <button type="button" className="lv-ben-btn lv-ben-btn-danger" onClick={onLogout}>
              <LogOut size={15} />
              <span>{en ? 'Sign out' : 'Đăng xuất'}</span>
            </button>
          )}
        </div>
      </section>

      {/* Mandatory Regulatory & Legal Notice (PS-90 Boundary Rule) */}
      <section className="lv-ben-notice lv-ben-notice--alert" aria-label={en ? 'Important regulatory guidance' : 'Quy định pháp lý quan trọng'}>
        <h2 className="lv-ben-notice__heading">
          <AlertCircle size={18} aria-hidden="true" />
          <span>{en ? 'Important Legal & Operational Boundaries' : 'Quy định pháp lý & Giới hạn vận hành'}</span>
        </h2>
        <p className="lv-ben-notice__desc">
          <strong>{en ? 'Invitation code scope: ' : 'Phạm vi mã mời: '}</strong>
          {en
            ? 'Invitation codes are used solely to link your login account with the beneficiary record designated by the Vault Owner. Having an invitation code or active account does NOT mean you can inspect assets, confirm that the Owner has passed away, or that handover has occurred.'
            : 'Mã mời chỉ có tác dụng liên kết tài khoản đăng nhập với hồ sơ người thụ hưởng được ghi nhận trong kho di sản. Việc có mã mời hoặc tài khoản hoạt động KHÔNG đồng nghĩa với việc bạn được xem chi tiết tài sản, không khẳng định Chủ sở hữu đã qua đời, và không thay thế việc bàn giao hợp pháp.'}
        </p>
        <p className="lv-ben-notice__desc">
          <strong>{en ? 'No unauthorized access: ' : 'Không tự ý truy cập kho: '}</strong>
          {en
            ? 'Signing in does not grant access to an Owner’s vault or permission to decrypt assets. Handover is contingent upon an approved, valid legal scope and required counter verification checks. Asset details and handover progress are not available on this self-service page.'
            : 'Đăng nhập không cấp quyền truy cập kho của Chủ sở hữu hoặc giải mã tài sản. Việc bàn giao phụ thuộc phạm vi pháp lý được duyệt và các bước kiểm tra bắt buộc tại quầy. Trang này chưa cung cấp chi tiết tài sản hay trạng thái bàn giao tự phục vụ.'}
        </p>
        <p className="lv-ben-notice__desc">
          <strong>{en ? 'Strict protocol: ' : 'Quy chuẩn an toàn: '}</strong>
          {en
            ? 'LegacyVault does not operate secret asset portals, remote guest retrieval links, or unverified OTP-based self-handover.'
            : 'LegacyVault không cung cấp cổng tài sản bí mật (Secret Vault), cổng khách (Guest Portal), hay mã xác thực OTP từ xa để tự bàn giao di sản.'}
        </p>
      </section>

      {/* In-Person Handover Process Steps */}
      <section className="lv-ben-card" aria-label={en ? 'Handover procedure' : 'Quy trình tiếp nhận di sản'}>
        <div className="lv-ben-card__title-row">
          <h2 className="lv-ben-card__title">
            <FileCheck2 size={20} aria-hidden="true" />
            <span>{en ? 'Inheritance Handover Procedure' : 'Quy trình tiếp nhận di sản tại quầy'}</span>
          </h2>
        </div>
        <p style={{ margin: '0 0 16px', color: '#6b726b', fontSize: 14 }}>
          {en
            ? 'To ensure complete legal compliance and the absolute security of heritage assets, all handover steps are conducted directly with designated Staff Executors at the counter.'
            : 'Để đảm bảo tính pháp lý và an toàn tuyệt đối cho tài sản di sản, toàn bộ quy trình tiếp nhận được thực hiện trực tiếp với Nhân viên thực thi tại quầy.'}
        </p>

        <div className="lv-ben-process">
          <div className="lv-ben-step">
            <span className="lv-ben-step__number">1</span>
            <div className="lv-ben-step__body">
              <h3 className="lv-ben-step__title">
                {en ? 'In-Person Identity Verification' : 'Đối chiếu danh tính trực tiếp tại quầy'}
              </h3>
              <p className="lv-ben-step__desc">
                {en
                  ? 'Present your original valid identification documents (Citizen Identity Card / Passport) at the service counter. Staff directly verifies your identity against the heritage record.'
                  : 'Người thụ hưởng xuất trình CCCD/Hộ chiếu bản gốc tại quầy giao dịch. Nhân viên thực thi sẽ đối chiếu danh tính trực tiếp với hồ sơ di sản.'}
              </p>
            </div>
          </div>

          <div className="lv-ben-step">
            <span className="lv-ben-step__number">2</span>
            <div className="lv-ben-step__body">
              <h3 className="lv-ben-step__title">
                {en ? 'Official Account Linking or Offline Record' : 'Liên kết tài khoản hoặc Lập biên bản ngoại tuyến'}
              </h3>
              <p className="lv-ben-step__desc">
                {en
                  ? 'Staff links your account or assists with creating a new account with a private password. For beneficiaries who prefer not to maintain an online account, Staff executes a paper-based offline handover record according to strict regulations.'
                  : 'Nhân viên hỗ trợ liên kết tài khoản hoặc hướng dẫn tạo tài khoản mới với mật khẩu riêng. Với người thụ hưởng không muốn dùng tài khoản trực tuyến, nhân viên thực thi lập biên bản giao nhận ngoại tuyến (bản giấy) theo đúng quy định.'}
              </p>
            </div>
          </div>

          <div className="lv-ben-step">
            <span className="lv-ben-step__number">3</span>
            <div className="lv-ben-step__body">
              <h3 className="lv-ben-step__title">
                {en ? 'Legal Approval & Controlled Handover Session' : 'Thẩm định pháp lý & Mở phiên bàn giao'}
              </h3>
              <p className="lv-ben-step__desc">
                {en
                  ? 'Handover only initiates after a Legal Verifier has formally approved the allocation scope and the vault has been unlocked under dual-authorized system safeguards.'
                  : 'Phiên bàn giao chỉ được mở sau khi Chuyên viên Pháp lý hoàn tất thẩm định, phê duyệt phạm vi phân bổ tài sản còn hiệu lực và kho di sản đã được mở khóa có kiểm soát.'}
              </p>
            </div>
          </div>

          <div className="lv-ben-step">
            <span className="lv-ben-step__number">4</span>
            <div className="lv-ben-step__body">
              <h3 className="lv-ben-step__title">
                {en ? 'Physical / Digital Asset Delivery & Signed Receipt' : 'Bàn giao tài sản & Ký nhận biên bản'}
              </h3>
              <p className="lv-ben-step__desc">
                {en
                  ? 'Assets within your approved scope are transferred individually. You sign the handover receipt directly at the counter for Staff to record into the case according to regulations.'
                  : 'Từng tài sản trong phạm vi phân bổ được chuyển giao. Người thụ hưởng ký nhận biên bản bàn giao tại quầy để nhân viên ghi nhận vào hồ sơ theo đúng quy định.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Staff Counter Contact Guidance (Neutral, Non-speculative) */}
      <section className="lv-ben-card" aria-label={en ? 'Counter contact information' : 'Thông tin liên hệ quầy tiếp nhận'}>
        <div className="lv-ben-card__title-row">
          <h2 className="lv-ben-card__title">
            <PhoneCall size={20} aria-hidden="true" />
            <span>{en ? 'Contact Counter Staff for Assistance' : 'Liên hệ Nhân viên quầy tiếp nhận'}</span>
          </h2>
        </div>
        <p style={{ margin: '0', color: '#4b554b', fontSize: 14, lineHeight: 1.6 }}>
          {en
            ? 'To complete in-person identity verification or receive assistance regarding your beneficiary record, please contact the designated Staff Executor through the channels provided in your notice or visit the designated service counter.'
            : 'Để thực hiện các thủ tục xác minh danh tính tại quầy hoặc nhận hỗ trợ về hồ sơ thụ hưởng, vui lòng liên hệ Nhân viên thực thi phụ trách qua các kênh đã được cung cấp trong thông báo hoặc làm việc trực tiếp tại quầy giao dịch được chỉ định.'}
        </p>
      </section>
    </main>
  );
}
