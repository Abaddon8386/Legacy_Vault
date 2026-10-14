import { ApiError } from './http.js';
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const isUtcDate = value => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value));
export function readUser(raw) {
  if (!isUuid(raw?.id) || typeof raw.fullName !== 'string' || !raw.fullName.trim() ||
      typeof raw.email !== 'string' || !raw.email.includes('@') || !Array.isArray(raw.roles) ||
      !raw.roles.length || !raw.roles.every(role => ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'].includes(role))) throw new ApiError('INVALID_AUTH_RESPONSE');
  return { id: raw.id, fullName: raw.fullName, email: raw.email, roles: [...raw.roles] };
}
