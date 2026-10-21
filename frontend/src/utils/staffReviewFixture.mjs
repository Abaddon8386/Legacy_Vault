// Contract-shaped synthetic responses for FE tests only; never imported by runtime UI.
export const ids = {
  caseId: '11111111-1111-4111-8111-111111111111', sessionId: '22222222-2222-4222-8222-222222222222',
  recipient: '33333333-3333-4333-8333-333333333333', assetId: '44444444-4444-4444-8444-444444444444',
  otherCaseId: '55555555-5555-4555-8555-555555555555', otherSessionId: '66666666-6666-4666-8666-666666666666',
};
export const json = (value, status = 200) => new Response(JSON.stringify(value), {status, headers:{'Content-Type':'application/json'}});
export function staffFixture({status = 'OPEN', closed = false, deliveries = [], receipts = [], ready = true} = {}) {
  const session = {
    ...ids, vaultId: ids.assetId, staffId: ids.recipient, status,
    openedAt: '2026-10-20T08:00:00Z', closedAt: status === 'OPEN' ? null : '2026-10-20T09:00:00Z',
  };
  return (url) => {
    if (url.endsWith('/completion-progress')) return json({assets:{completed:ready?1:0,total:1}, beneficiaries:{completed:ready?1:0,total:1},ready,reason:ready?'READY':'PENDING'});
    if (url.endsWith('/deliveries')) return json(deliveries);
    if (url.endsWith('/receipts')) return json(receipts);
    if (url.includes('/handover-sessions/')) return json({...session,caseId:url.match(/verification-cases\/([^/]+)/)[1],sessionId:url.split('/').at(-1)});
    if (url.includes('/verification-cases/')) return json({caseId:url.split('/').at(-1),status:closed?'CLOSED':'OPEN'});
    throw Error('Unexpected fixture request: '+url);
  };
}
export const deliveredItem = {itemId:ids.assetId,sessionId:ids.sessionId,recipientId:ids.recipient,assetId:ids.assetId,status:'DELIVERED',staffId:ids.otherCaseId,deliveredAt:'2026-10-20T08:00:00'};
