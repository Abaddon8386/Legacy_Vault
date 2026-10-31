import {API_BASE,ApiError,request} from '../api/http.js';
const uuid=value=>typeof value==='string'&&/^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value);
function root(caseId,sessionId){if(!uuid(caseId)||!uuid(sessionId))throw new ApiError('VALIDATION_FAILED',400);return `/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/group-handover`;}
export function readGroupView(value){
  const s=value?.state;
  if(!s||!['UNCONFIRMED','READY','SUSPENDED','AWAITING_LEGAL'].includes(s.status)||!Number.isSafeInteger(s.revision)||s.revision<0||typeof s.allPresent!=='boolean'||typeof value.snapshot!=='string'||!Array.isArray(value.requiredRecipientIds)||!value.requiredRecipientIds.length||!value.requiredRecipientIds.every(uuid)||new Set(value.requiredRecipientIds).size!==value.requiredRecipientIds.length||typeof value.deliveryAllowed!=='boolean'||(s.requestId!==null&&!uuid(s.requestId))||(value.deliveryAllowed&&(s.status!=='READY'||!s.allPresent||s.snapshot!==value.snapshot)))throw new ApiError('INVALID_RESPONSE');
  return value;
}
export async function loadGroupHandover(caseId,sessionId,options){return readGroupView(await request(root(caseId,sessionId),{...options,cache:'no-store',expectedStatus:200}));}
export async function saveGroupHandover(caseId,sessionId,action,body,key,options={}){
  if(!['attendance','reopen-requests'].includes(action)||!uuid(key))throw new ApiError('VALIDATION_FAILED',400);
  let response;try{response=await (options.fetchFn||globalThis.fetch)(API_BASE+root(caseId,sessionId)+'/'+action,{method:'POST',signal:options.signal,credentials:'omit',cache:'no-store',headers:{Authorization:`Bearer ${options.accessToken}`,'Content-Type':'application/json','Accept-Language':options.lang||'vi','Idempotency-Key':key},body:JSON.stringify(body)});}catch(error){if(error.name==='AbortError')throw error;throw new ApiError('NETWORK_ERROR');}
  let result;try{result=await response.json();}catch{throw new ApiError('INVALID_RESPONSE',response.status);}
  if(!response.ok)throw new ApiError(result?.code||'INTERNAL_ERROR',response.status);
  if(response.status!==200||result?.caseId!==caseId||result.sessionId!==sessionId||!uuid(result.eventId)||!Number.isSafeInteger(result.state?.revision)||result.state.revision!==body.expectedRevision+1)throw new ApiError('INVALID_RESPONSE');
  return result;
}
