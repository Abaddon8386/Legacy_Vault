export default function BeneficiaryHome({ lang = 'vi', onOpenProfile }) {
  const en = lang === 'en';
  return <section aria-labelledby="beneficiary-home-title" style={{ maxWidth: 800, lineHeight: 1.8 }}>
    <h1 id="beneficiary-home-title">{en ? 'Beneficiary information' : 'Thông tin dành cho người thụ hưởng'}</h1>
    <p>{en ? 'You are signed in with a beneficiary account.' : 'Bạn đã đăng nhập bằng tài khoản người thụ hưởng.'}</p>
    <div style={{ background: '#fff', border: '1px solid #eae5dc', borderRadius: 16, padding: 28, marginTop: 24 }}>
      <h2>{en ? 'Receiving your inheritance' : 'Tiếp nhận tài sản được bàn giao'}</h2>
      <p>{en ? 'Please work with Staff at the counter for identity checks, account linking and handover guidance. Staff records the handover and your confirmation separately.' : 'Vui lòng làm việc với nhân viên tại quầy để được xác minh danh tính, liên kết tài khoản và hướng dẫn bàn giao. Nhân viên ghi nhận việc bàn giao và xác nhận của bạn riêng biệt.'}</p>
      <p>{en ? 'Signing in does not grant access to an Owner’s vault or permission to decrypt assets. Handover depends on the approved legal scope and required checks. Asset details and handover status are not available on this page.' : 'Đăng nhập không cấp quyền truy cập kho của chủ sở hữu hoặc giải mã tài sản. Việc bàn giao phụ thuộc phạm vi pháp lý được duyệt và các bước kiểm tra bắt buộc. Trang này chưa cung cấp chi tiết tài sản hay trạng thái bàn giao.'}</p>
      <button type="button" style={{ marginTop: 20, minHeight: 44, padding: '10px 20px', border: 0, borderRadius: 10, background: '#164639', color: '#fff', cursor: 'pointer', font: 'inherit' }} onClick={onOpenProfile}>{en ? 'View account profile' : 'Xem hồ sơ tài khoản'}</button>
    </div>
  </section>;
}
