import test from 'node:test';
import assert from 'node:assert/strict';
import React, {act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {workflowFailure, staffSessionPrerequisite} from './workflowFeedback.js';
const dom=new JSDOM('<body></body>',{url:'http://localhost/staff/close-and-archive'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const built=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/components/staff/StaffSessionBoundary.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(built)?built[0]:built).output.find(item=>item.type==='chunk'&&item.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const Boundary=(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
const cid='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333';
const item={caseId:cid,caseNumber:'HS-2026-000003',status:'OPEN',assignmentStatus:'ASSIGNED_TO_CURRENT_STAFF',vaultStatus:'UNLOCKED'};
const session={caseId:cid,sessionId:sid,vaultId:other,staffId:other,status:'COMPLETED',openedAt:'2026-10-20T08:00:00Z',closedAt:'2026-10-20T09:00:00Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const original=globalThis.fetch;test.afterEach(()=>{globalThis.fetch=original;window.history.replaceState({},'','/staff/close-and-archive')});
function Child({sessionId,caseItem}){return React.createElement('div',{'data-child':true},caseItem.caseNumber+' '+sessionId)}
async function mount(extra={}){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);const props={caseId:cid,sessionId:'',accessToken:'fixture',children:React.createElement(Child),...extra};const render=p=>act(async()=>root.render(React.createElement(Boundary,p)));await render(props);return{host,render:p=>render({...props,...p}),close:async()=>{await act(async()=>root.unmount());host.remove()}}}
test('missing case is a selection state, performs no requests and mounts no workflow',async()=>{globalThis.fetch=()=>assert.fail('No API before selection');const v=await mount({caseId:''});try{assert.match(v.host.textContent,/Chọn hồ sơ để tiếp tục/);assert.equal(v.host.querySelector('[role=alert]'),null);assert.equal(v.host.querySelector('[data-child]'),null)}finally{await v.close()}});
test('unassigned case names the Staff prerequisite and never calls session endpoints',async()=>{const reads=[];globalThis.fetch=async url=>{reads.push(url);return json({...item,assignmentStatus:'UNASSIGNED_CLAIMABLE'})};const v=await mount();try{assert.match(v.host.textContent,/Staff chưa nhận xử lý/);assert.equal(reads.length,1);assert.equal(v.host.querySelector('[role=alert]'),null);assert.equal(v.host.querySelector('[data-child]'),null)}finally{await v.close()}});
test('no sessions before legal completion is business waiting, not a system error',async()=>{globalThis.fetch=async url=>json(url.endsWith('/handover-sessions')?[]:{...item,vaultStatus:'WILL_VERIFICATION'});const v=await mount();try{assert.match(v.host.textContent,/Chờ Legal đối chiếu di chúc/);assert.ok(v.host.querySelector('a[href^="/staff/legal-documents"]'));assert.equal(v.host.querySelector('[role=alert]'),null);assert.equal(v.host.querySelector('[data-child]'),null)}finally{await v.close()}});
test('assigned unlocked case with no session directs Staff to open it',async()=>{globalThis.fetch=async url=>json(url.endsWith('/handover-sessions')?[]:item);const v=await mount();try{assert.match(v.host.textContent,/Staff chưa mở phiên/);assert.ok(v.host.querySelector('a[href^="/staff/handover"]'));assert.equal(v.host.querySelector('[role=alert]'),null)}finally{await v.close()}});
test('one existing completed session is recovered and persisted before mounting the workflow',async()=>{let selected;globalThis.fetch=async url=>json(url.endsWith('/handover-sessions')?[session]:item);const v=await mount({onSessionChange:value=>{selected=value}});try{assert.equal(selected,sid);assert.equal(new URLSearchParams(window.location.search).get('sessionId'),sid);assert.match(v.host.querySelector('[data-child]').textContent,/HS-2026-000003/)}finally{await v.close()}});
test('404 for an explicit session is unavailable scope, never a fabricated pending Legal step',async()=>{globalThis.fetch=async url=>url.endsWith(sid)?json({code:'RESOURCE_NOT_FOUND'},404):json(item);const v=await mount({sessionId:sid});try{assert.ok(v.host.querySelector('[role=alert]'));assert.match(v.host.textContent,/Không truy cập được/);assert.doesNotMatch(v.host.textContent,/Chờ Legal/);assert.equal(v.host.querySelector('[data-child]'),null)}finally{await v.close()}});
test('server failure stays technical and explicit retry loads the latest context',async()=>{let failed=true;globalThis.fetch=async url=>failed?json({},500):json(url.endsWith(sid)?session:item);const v=await mount({sessionId:sid});try{assert.match(v.host.textContent,/Không tải được dữ liệu từ máy chủ/);failed=false;await act(async()=>[...v.host.querySelectorAll('button')].find(e=>e.textContent==='Kiểm tra trạng thái mới').click());assert.ok(v.host.querySelector('[data-child]'))}finally{await v.close()}});
test('switching case aborts its read and rejects late context',async()=>{let finish,signal;globalThis.fetch=async(url,options)=>url.endsWith(cid)?new Promise(resolve=>{finish=resolve;signal=options.signal}):json({...item,caseId:other,caseNumber:'HS-2026-000004',assignmentStatus:'UNASSIGNED_CLAIMABLE'});const v=await mount();try{await v.render({caseId:other});assert.equal(signal.aborted,true);await act(async()=>finish(json(item)));assert.match(v.host.textContent,/Staff chưa nhận xử lý/);assert.equal(v.host.querySelector('[data-child]'),null)}finally{await v.close()}});
test('failure classification separates explicit business codes from access, state conflict and transport failures',()=>{for(const lang of ['vi','en']){assert.equal(workflowFailure({status:409,code:'LEGAL_APPROVAL_REQUIRED'},lang).kind,'waiting');assert.equal(workflowFailure({status:404},lang).kind,'access');assert.equal(workflowFailure({status:403,code:'LEGAL_APPROVAL_REQUIRED'},lang).kind,'access');assert.equal(workflowFailure({status:409},lang).kind,'changed');assert.equal(workflowFailure({status:503},lang).kind,'system');assert.equal(workflowFailure({code:'INVALID_RESPONSE'},lang).kind,'system')}});



test('server distribution phases identify the responsible role without inventing a completed step',()=>{
 const titles={AWAITING_DOCUMENTS:'Staff',DOCUMENTS_UNDER_REVIEW:'Legal',AWAITING_ALLOCATIONS:'Staff',ALLOCATIONS_UNDER_REVIEW:'Legal',FINAL_APPROVAL:'Legal',APPROVED:'Legal'};
 for(const [phase,owner] of Object.entries(titles)) for(const lang of ['vi','en']) {
  const result=staffSessionPrerequisite({...item,vaultStatus:'LEGAL_BASIS_VERIFICATION',distributionWorkflow:{phase}},lang);
  assert.equal(result.kind,'waiting');assert.match(result.title,new RegExp(owner));assert.equal(result.destination,'basis');
 }
 assert.equal(workflowFailure({status:500,code:'LEGAL_APPROVAL_REQUIRED'}).kind,'system');
});
test('completed sessions do not mount an active delivery screen',async()=>{globalThis.fetch=async url=>json(url.endsWith(sid)?session:item);const v=await mount({sessionId:sid,operation:'delivery'});try{assert.match(v.host.textContent,/Phiên này đã kết thúc/);assert.equal(v.host.querySelector('[data-child]'),null);assert.equal(v.host.querySelector('[role=alert]'),null)}finally{await v.close()}});
