import { API_BASE, ApiError, request } from '../api/http.js';
import { passwordFetch } from '../api/passwordRequest.js';
import { isUuid } from '../api/contracts.js';
/**
 * Các MIME type tài liệu được phép đính kèm tài sản (PDF, DOC, DOCX).
 */
export const DOCUMENT_TYPES=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
/**
 * Kiểm tra danh sách tệp tài liệu trước khi tải lên: không rỗng, tối đa 5 tệp (tính cả {@code count} tệp đã có),
 * mỗi tệp 1 byte đến 10MB, đuôi pdf/doc/docx và MIME type thuộc {@link DOCUMENT_TYPES}.
 * @param {File[]} files Tệp cần tải.
 * @param {number} [count=0] Số tài liệu đã tồn tại của tài sản.
 * @throws {ApiError} {@code VALIDATION_FAILED} (400) khi không hợp lệ.
 */
export function validateDocuments(files,count=0) {
  if(!files.length||files.length+count>5||files.some(f=>!f.size||f.size>10*1024*1024||! /\.(pdf|doc|docx)$/i.test(f.name)|| (f.type&&!DOCUMENT_TYPES.includes(f.type)))) throw new ApiError('VALIDATION_FAILED',400);
}
/**
 * Dựng đường dẫn {@code /vaults/{vaultId}/assets/{assetId}/documents[/{documentId}]}; ném {@code VALIDATION_FAILED} nếu id không phải UUID.
 */
function path(v,a,d) {if(!isUuid(v)||!isUuid(a)||(d!==undefined&&!isUuid(d)))throw new ApiError('VALIDATION_FAILED');return `/vaults/${v}/assets/${a}/documents`+(d?'/'+d:'');}
/**
 * Xác thực danh sách metadata tài liệu từ backend (id UUID, fileName, contentType hợp lệ, sizeBytes > 0, sha256 64 ký tự hex).
 * @throws {ApiError} {@code INVALID_RESPONSE} nếu sai hợp đồng.
 */
function read(value) {
  if(!Array.isArray(value)||value.some(x=>!isUuid(x?.id)||typeof x.fileName!=='string'||!DOCUMENT_TYPES.includes(x.contentType)||!Number.isSafeInteger(x.sizeBytes)||x.sizeBytes<=0||! /^[a-f0-9]{64}$/i.test(x.sha256)))throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Gửi request không phải JSON thuần (multipart/DELETE/tải nhị phân) kèm Bearer token. Nếu body là JSON (có mật khẩu) thì đi qua
 * {@code passwordFetch} để hỗ trợ thiết lập mật khẩu lần đầu. Khi HTTP lỗi, đọc mã lỗi từ JSON hoặc suy ra từ status.
 * @returns {Promise<Response>} Phản hồi thành công.
 * @throws {ApiError} {@code NETWORK_ERROR}, {@code DOCUMENT_REQUEST_FAILED} hoặc mã lỗi backend.
 */
async function send(url,init,options) {
  let response;
  const transport = init.body && init.headers?.['Content-Type'] === 'application/json'
    ? (url, init) => passwordFetch(url, init, options) : (options.fetchFn || fetch);
  try {response=await transport(API_BASE+url,{...init,headers:{Authorization:`Bearer ${options.accessToken}`,'Accept-Language':options.lang||'vi',...init.headers},signal:options.signal,credentials:'omit'});}
  catch(err){if(err.name==='AbortError'||err.code)throw err;throw new ApiError('NETWORK_ERROR');}
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiError(body.code||({401:'UNAUTHENTICATED',403:'ACCESS_DENIED',404:'RESOURCE_NOT_FOUND'}[response.status])||'DOCUMENT_REQUEST_FAILED',response.status);}
  return response;
}
/**
 * Service tài liệu đính kèm của tài sản (dùng bởi {@code AssetDetailModal}, {@code AssetEditModal}, {@code AssetDocuments}).
 * Các API: {@code GET/POST /vaults/{vaultId}/assets/{assetId}/documents}, {@code DELETE .../documents/{documentId}},
 * {@code POST .../documents/{documentId}/download}.
 */
export const assetDocumentService={
  /**
   * Liệt kê tài liệu: {@code GET /vaults/{v}/assets/{a}/documents} (200).
   * @returns {Promise<Array>} Danh sách metadata tài liệu.
   */
  async list(v,a,options){return read(await request(path(v,a),{...options,expectedStatus:200}));},
  /**
   * Tải tài liệu lên: {@code POST /vaults/{v}/assets/{a}/documents} (multipart, trường {@code documents}), kỳ vọng 201.
   * @param {File[]} files Tệp (được kiểm tra bằng {@link validateDocuments}).
   * @returns {Promise<Array>} Metadata các tài liệu vừa tạo.
   */
  async upload(v,a,files,options={}){validateDocuments(files);const body=new FormData();files.forEach(f=>body.append('documents',f));const res=await send(path(v,a),{method:'POST',body},options);if(res.status!==201)throw new ApiError('INVALID_RESPONSE');return read(await res.json());},
  /**
   * Xóa một tài liệu: {@code DELETE /vaults/{v}/assets/{a}/documents/{d}}, kỳ vọng 204.
   */
  async remove(v,a,d,options={}){const res=await send(path(v,a,d),{method:'DELETE'},options);if(res.status!==204)throw new ApiError('INVALID_RESPONSE');},
  /**
   * Tải nội dung tài liệu: {@code POST /vaults/{v}/assets/{a}/documents/{id}/download} với body {@code {password}} (xác nhận lại mật khẩu, tối đa 72 ký tự).
   * @param {object} document Metadata tài liệu (dùng {@code id} và {@code contentType}).
   * @param {string} password Mật khẩu hiện tại của chủ hầm.
   * @returns {Promise<Blob>} Nội dung tệp; ném {@code INVALID_RESPONSE} nếu content-type không khớp.
   */
  async download(v,a,document,password,options={}){
    if(typeof password!=='string'||!password.trim()||password.length>72)throw new ApiError('VALIDATION_FAILED',400);
    const res=await send(path(v,a,document.id)+'/download',{method:'POST',body:JSON.stringify({password}),headers:{'Content-Type':'application/json'}},options);
    if(res.status!==200||res.headers.get('content-type')?.split(';')[0]!==document.contentType)throw new ApiError('INVALID_RESPONSE');
    return res.blob();
  },
};
