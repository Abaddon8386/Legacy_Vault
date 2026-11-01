import {ApiError} from '../api/http.js';
// FE view model only. PS-122 must supply an authorized adapter; no endpoint is assumed.
export function readBeneficiaryHandover(value,userId){
  if(value?.subjectId!==userId||!Array.isArray(value?.cases))throw new ApiError('INVALID_RESPONSE');
  for(const item of value.cases){if(typeof item.caseId!=='string'||typeof item.caseNumber!=='string'||!['UNCONFIRMED','READY','SUSPENDED','AWAITING_LEGAL'].includes(item.status)||!Number.isSafeInteger(item.totalAssets)||item.totalAssets<0||!Number.isSafeInteger(item.deliveredAssets)||item.deliveredAssets<0||item.deliveredAssets>item.totalAssets)throw new ApiError('INVALID_RESPONSE');}
  if(new Set(value.cases.map(x=>x.caseId)).size!==value.cases.length)throw new ApiError('INVALID_RESPONSE');
  // Deliberately discard any actor/reason/other-recipient fields supplied by a future adapter.
  return value.cases.map(({caseId,caseNumber,status,totalAssets,deliveredAssets})=>({caseId,caseNumber,status,totalAssets,deliveredAssets}));
}
