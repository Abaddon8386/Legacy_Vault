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
