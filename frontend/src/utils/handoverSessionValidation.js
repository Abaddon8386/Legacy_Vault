/**
 * Kiểm tra điều kiện được mở phiên bàn giao: kho phải ở trạng thái UNLOCKED (VAULT_NOT_UNLOCKED nếu không) và chưa có phiên ACTIVE nào của hồ sơ (DUPLICATE_SESSION_ACTIVE).
 * @param {string} vaultStatus Trạng thái kho do backend xác nhận.
 * @param {object|null} existingSession Phiên bàn giao hiện có (nếu có).
 * @returns {{canOpen:boolean,reasonCode:string,messageVi?:string,messageEn?:string}}
 * Dùng bởi pages/staff/handoverSessionService.js.
 */
export function evaluateSessionOpenPrerequisites(vaultStatus, existingSession = null) {
  if (vaultStatus !== 'UNLOCKED') {
    return {
      canOpen: false,
      reasonCode: 'VAULT_NOT_UNLOCKED',
      messageVi: 'Kho di sản chưa được xác nhận mở khóa. Vui lòng chờ phê duyệt hợp lệ và cập nhật trạng thái kho.',
      messageEn: 'Heritage vault is not confirmed UNLOCKED by Backend. Handover session cannot be initiated.',
    };
  }

  if (existingSession && existingSession.status === 'ACTIVE') {
    return {
      canOpen: false,
      reasonCode: 'DUPLICATE_SESSION_ACTIVE',
      messageVi: 'Đã có phiên bàn giao đang hoạt động cho hồ sơ này.',
      messageEn: 'An active handover session already exists for this case.',
    };
  }

  return {
    canOpen: true,
    reasonCode: 'OK',
  };
}
