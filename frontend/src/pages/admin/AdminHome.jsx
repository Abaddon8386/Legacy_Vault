export default function AdminHome({ lang = 'vi', onOpenProfile, onOpenSubscriptions }) {
  const en = lang === 'en';
  return <section aria-labelledby="admin-home-title" style={{ maxWidth: 840, lineHeight: 1.8 }}>
    <h1 id="admin-home-title">{en ? 'Administration overview' : 'Tổng quan quản trị'}</h1>
    <p>{en ? 'You are signed in with an administrator account.' : 'Bạn đã đăng nhập bằng tài khoản quản trị viên.'}</p>
    
    <div style={{ background: '#fff', border: '1px solid #eae5dc', borderRadius: 16, padding: 28, marginTop: 24, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
      <h2 style={{ margin: '0 0 10px 0', fontSize: 18, color: '#164639' }}>{en ? 'Subscription Plans & Accounts Management' : 'Quản lý gói sử dụng & Tài khoản'}</h2>
      <p style={{ margin: '0 0 16px 0', fontSize: 14, color: '#4a5568' }}>
        {en
          ? 'Manage plans catalog (Basic, Standard, Extended), create draft versions, publish configuration changes, and look up real account usage.'
          : 'Quản lý danh mục gói (Cơ bản, Tiêu chuẩn, Mở rộng), tạo phiên bản cấu hình, chỉnh sửa bản nháp, công bố và tra cứu mức sử dụng tài khoản thật.'}
      </p>
      <button
        type="button"
        style={{ minHeight: 44, padding: '10px 22px', border: 0, borderRadius: 10, background: '#164639', color: '#fff', cursor: 'pointer', font: 'inherit', fontWeight: 600, marginRight: 12 }}
        onClick={onOpenSubscriptions}
      >
        {en ? 'Manage subscriptions' : 'Quản lý gói sử dụng'}
      </button>
    </div>

    <div style={{ background: '#fff', border: '1px solid #eae5dc', borderRadius: 16, padding: 28, marginTop: 20, boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}>
      <h2 style={{ margin: '0 0 10px 0', fontSize: 18, color: '#164639' }}>{en ? 'Your account' : 'Tài khoản của bạn'}</h2>
      <p style={{ margin: '0 0 8px 0', fontSize: 14, color: '#4a5568' }}>
        {en ? 'You can view and update your account profile.' : 'Bạn có thể xem và cập nhật hồ sơ tài khoản cá nhân.'}
      </p>
      <p style={{ margin: '0 0 16px 0', fontSize: 13, color: '#718096' }}>
        {en
          ? 'Administrator status does not automatically grant access to private vault contents or authority to approve or perform asset handovers.'
          : 'Vai trò quản trị không tự cấp quyền xem nội dung kho riêng, phê duyệt hoặc thực hiện bàn giao tài sản.'}
      </p>
      <button
        type="button"
        style={{ minHeight: 44, padding: '10px 20px', border: '1px solid #164639', borderRadius: 10, background: '#fff', color: '#164639', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
        onClick={onOpenProfile}
      >
        {en ? 'View account profile' : 'Xem hồ sơ tài khoản'}
      </button>
    </div>
  </section>;
}