import { API_BASE, ApiError, request } from '../api/http.js';
import { isUuid } from '../api/contracts.js';
export const DOCUMENT_TYPES=['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
export function validateDocuments(files,count=0) {
  if(!files.length||files.length+count>5||files.some(f=>!f.size||f.size>10*1024*1024||! /\.(pdf|doc|docx)$/i.test(f.name)|| (f.type&&!DOCUMENT_TYPES.includes(f.type)))) throw new ApiError('VALIDATION_FAILED',400);
}
function path(v,a,d) {if(!isUuid(v)||!isUuid(a)||(d!==undefined&&!isUuid(d)))throw new ApiError('VALIDATION_FAILED');return `/vaults/${v}/assets/${a}/documents`+(d?'/'+d:'');}
function read(value) {
  if(!Array.isArray(value)||value.some(x=>!isUuid(x?.id)||typeof x.fileName!=='string'||!DOCUMENT_TYPES.includes(x.contentType)||!Number.isSafeInteger(x.sizeBytes)||x.sizeBytes<=0||! /^[a-f0-9]{64}$/i.test(x.sha256)))throw new ApiError('INVALID_RESPONSE');
  return value;
}
async function send(url,init,options) {
  let response;
  try {response=await(options.fetchFn||fetch)(API_BASE+url,{...init,headers:{Authorization:`Bearer ${options.accessToken}`,'Accept-Language':options.lang||'vi',...init.headers},signal:options.signal,credentials:'omit'});}
  catch(err){if(err.name==='AbortError')throw err;throw new ApiError('NETWORK_ERROR');}
  if(!response.ok){const body=await response.json().catch(()=>({}));throw new ApiError(body.code||({401:'UNAUTHENTICATED',403:'ACCESS_DENIED',404:'RESOURCE_NOT_FOUND'}[response.status])||'DOCUMENT_REQUEST_FAILED',response.status);}
  return response;
}
export const assetDocumentService={
  async list(v,a,options){return read(await request(path(v,a),{...options,expectedStatus:200}));},
  async upload(v,a,files,options={}){validateDocuments(files);const body=new FormData();files.forEach(f=>body.append('documents',f));const res=await send(path(v,a),{method:'POST',body},options);if(res.status!==201)throw new ApiError('INVALID_RESPONSE');return read(await res.json());},
  async remove(v,a,d,options={}){const res=await send(path(v,a,d),{method:'DELETE'},options);if(res.status!==204)throw new ApiError('INVALID_RESPONSE');},
  async download(v,a,document,password,options={}){
    if(typeof password!=='string'||!password.trim()||password.length>72)throw new ApiError('VALIDATION_FAILED',400);
    const res=await send(path(v,a,document.id)+'/download',{method:'POST',body:JSON.stringify({password}),headers:{'Content-Type':'application/json'}},options);
    if(res.status!==200||res.headers.get('content-type')?.split(';')[0]!==document.contentType)throw new ApiError('INVALID_RESPONSE');
    return res.blob();
  },
};
