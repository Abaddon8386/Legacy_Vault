import { isUuid } from '../api/contracts.js';

const clean = value => typeof value === 'string' ? value.trim() : '';
const limits = { fullName: 150, relationship: 100, phone: 20, email: 254 };
export function buildCourtAllocations(rows, { assets = [], recipients = [], requireCatalog = false } = {}) {
  const errors = [];
  const seen = new Set();
  const allocations = (rows || []).map((row, index) => {
    const fail = key => errors.push({ row: index + 1, key });
    const assetId = clean(row.assetId), beneficiaryId = clean(row.beneficiaryId), description = clean(row.description);
    if (!isUuid(assetId) || (requireCatalog && !assets.some(asset => asset.assetId === assetId))) fail('asset');
    if (description.length > 2000) fail('description');
    let result, recipientKey;
    if (row.recipientKind === 'court') {
      const courtRecipient = Object.fromEntries(Object.keys(limits).map(key => [key, clean(row.courtRecipient?.[key]) || null]));
      courtRecipient.dateOfBirth = clean(row.courtRecipient?.dateOfBirth) || null;
      if (!courtRecipient.fullName || Object.entries(limits).some(([key, limit]) => (courtRecipient[key]?.length || 0) > limit)) fail('recipient');
      if (courtRecipient.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(courtRecipient.email)) fail('email');
      const date = courtRecipient.dateOfBirth;
      if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10))) fail('birth');
      recipientKey = `court:${clean(courtRecipient.fullName).toLowerCase()}|${date || ''}`;
      // Identity attestation, account IDs and roles are never taken from this form.
      result = { assetId, description, courtRecipient };
    } else if (!row.recipientKind || row.recipientKind === 'existing') {
      if (!isUuid(beneficiaryId) || (requireCatalog && !recipients.some(recipient => recipient.beneficiaryId === beneficiaryId))) fail('recipient');
      recipientKey = beneficiaryId;
      result = { assetId, beneficiaryId, description };
    } else { fail('recipient'); return null; }
    const pair = `${assetId}|${recipientKey}`;
    if (seen.has(pair)) fail('duplicate');
    seen.add(pair);
    return result;
  });
  if (!allocations.length) errors.push({ row: 0, key: 'empty' });
  return { allocations, errors };
}

export function courtAllocationError(error, lang = 'vi') {
  const en = lang === 'en';
  const messages = {
    asset: ['Chọn tài sản thuộc hồ sơ.', 'Select an asset from this case.'],
    recipient: ['Chọn người nhận trong hồ sơ hoặc nhập tên người nhận theo văn bản (tối đa 150 ký tự).', 'Select an existing recipient or enter the court recipient’s name (up to 150 characters).'],
    email: ['Email liên hệ chưa hợp lệ.', 'The contact email is invalid.'],
    birth: ['Ngày sinh chưa hợp lệ hoặc ở tương lai.', 'The birth date is invalid or in the future.'],
    description: ['Phần được hưởng tối đa 2.000 ký tự.', 'Allocation description must not exceed 2,000 characters.'],
    duplicate: ['Tài sản và người nhận bị lặp trong phân bổ.', 'This asset and recipient are repeated in the allocation.'],
    empty: ['Thêm ít nhất một mục phân bổ.', 'Add at least one allocation.'],
  };
  return `${error.row ? (en ? `Row ${error.row}: ` : `Dòng ${error.row}: `) : ''}${messages[error.key]?.[en ? 1 : 0] || messages.recipient[en ? 1 : 0]}`;
}
