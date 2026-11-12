import {API_BASE,ApiError,request} from '../api/http.js';
/**
 * Kiểm tra chuỗi có phải UUID hợp lệ (bản cục bộ của service bàn giao nhóm).
 */
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
/**
 * Dựng đường dẫn gốc {@code /staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover} (API phía Staff).
 * @throws {ApiError} {@code VALIDATION_FAILED} nếu id không phải UUID.
 */
function root(caseId,sessionId){if(!uuid(caseId)||!uuid(sessionId))throw new ApiError('VALIDATION_FAILED',400);return `/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/group-handover`;}
/**
 * Xác thực dữ liệu trạng thái bàn giao theo nhóm: trạng thái (UNCONFIRMED/READY/SUSPENDED/AWAITING_LEGAL), revision, danh sách người nhận bắt buộc
 * (UUID không trùng), cờ {@code deliveryAllowed} (chỉ true khi READY, có mặt đủ và snapshot khớp), điểm danh tùy chọn.
 * Cũng được {@code legalGroupHandoverService} dùng lại.
 * @throws {ApiError} {@code INVALID_RESPONSE} nếu sai hợp đồng.
 */
export function readGroupView(value){
  const s=value?.state;
  if(!s||!['UNCONFIRMED','READY','SUSPENDED','AWAITING_LEGAL'].includes(s.status)||!Number.isSafeInteger(s.revision)||s.revision<0||typeof s.allPresent!=='boolean'||typeof value.snapshot!=='string'||!Array.isArray(value.requiredRecipientIds)||!value.requiredRecipientIds.length||!value.requiredRecipientIds.every(uuid)||new Set(value.requiredRecipientIds).size!==value.requiredRecipientIds.length||typeof value.deliveryAllowed!=='boolean'||(s.requestId!==null&&!uuid(s.requestId))||(value.deliveryAllowed&&(s.status!=='READY'||!s.allPresent||s.snapshot!==value.snapshot)))throw new ApiError('INVALID_RESPONSE');
  if(value.attendance!=null&&(!Array.isArray(value.attendance.presentRecipientIds)||!value.attendance.presentRecipientIds.every(uuid)||new Set(value.attendance.presentRecipientIds).size!==value.attendance.presentRecipientIds.length))throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Tải trạng thái bàn giao nhóm: {@code GET /staff/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover} (200, không cache). Vai trò STAFF_EXECUTOR.
 * @returns {Promise<object>} Dữ liệu đã xác thực bởi {@link readGroupView}.
 */
export async function loadGroupHandover(caseId,sessionId,options){return readGroupView(await request(root(caseId,sessionId),{...options,cache:'no-store',expectedStatus:200}));}
/**
 * Ghi thao tác bàn giao nhóm của Staff: {@code POST .../group-handover/attendance} (điểm danh) hoặc {@code POST .../group-handover/reopen-requests}
 * (yêu cầu mở lại gửi Legal duyệt). Gửi header {@code Idempotency-Key} để thử lại an toàn; body phải có {@code expectedRevision}
 * và phản hồi phải có revision = expectedRevision + 1.
 * @param {string} caseId Hồ sơ xác minh.
 * @param {string} sessionId Phiên bàn giao.
 * @param {('attendance'|'reopen-requests')} action Loại thao tác.
 * @param {object} body Nội dung gửi.
 * @param {string} key UUID làm khóa idempotency.
 * @throws {ApiError} Mã lỗi backend (ví dụ xung đột revision), {@code NETWORK_ERROR}, {@code INVALID_RESPONSE}.
 */
export async function saveGroupHandover(caseId,sessionId,action,body,key,options={}){
  if(!['attendance','reopen-requests'].includes(action)||!uuid(key))throw new ApiError('VALIDATION_FAILED',400);
  let response;try{response=await (options.fetchFn||globalThis.fetch)(API_BASE+root(caseId,sessionId)+'/'+action,{method:'POST',signal:options.signal,credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${options.accessToken}`,'Content-Type':'application/json','Accept-Language':options.lang||'vi','Idempotency-Key':key},body:JSON.stringify(body)});}catch(error){if(error.name==='AbortError')throw error;throw new ApiError('NETWORK_ERROR');}
  let result;try{result=await response.json();}catch{throw new ApiError('INVALID_RESPONSE',response.status);}
  if(!response.ok)throw new ApiError(result?.code||'INTERNAL_ERROR',response.status);
  if(response.status!==200||result?.caseId!==caseId||result.sessionId!==sessionId||!uuid(result.eventId)||!Number.isSafeInteger(result.state?.revision)||result.state.revision!==body.expectedRevision+1)throw new ApiError('INVALID_RESPONSE');
  return result;
}
