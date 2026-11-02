import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const dom=new JSDOM('<body></body>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const output=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/components/common/WorkflowGuide.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(output)?output[0]:output).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const {default:Guide}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
async function mount(fn){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await fn(host,root);}finally{await act(async()=>root.unmount());host.remove();}}
const model={current:'will',message:'Kiểm tra căn cứ',next:{href:'/legal/basis-route-selection',label:'Đến bước thẩm định căn cứ'},steps:[
 {id:'death',label:'Giấy tờ khai tử',state:'done'}, {id:'will',label:'Đối chiếu di chúc',state:'done'},
 {id:'basis',label:'Thẩm định căn cứ',state:'action'}, {id:'approval',label:'Phê duyệt',state:'waiting'}, {id:'unlock',label:'Mở khóa',state:'blocked'},
]};
test('progress counts only done steps and viewing a completed step does not mark it as actionable',async()=>mount(async(host,root)=>{
 await act(async()=>root.render(React.createElement(Guide,{model})));
 assert.equal(host.querySelector('progress').value,2);assert.equal(host.querySelector('progress').max,5);
 assert.equal(host.querySelector('progress').getAttribute('aria-valuetext'),'2 trên 5 bước hoàn tất');
 const viewed=host.querySelector('[aria-current=step]');assert.match(viewed.textContent,/Đối chiếu di chúc/);assert.match(viewed.textContent,/Đang xem/);assert.equal(viewed.classList.contains('is-done'),true);
 assert.match(host.querySelector('li.is-action').textContent,/Thẩm định căn cứ/);
 const toggle=host.querySelector('.lv-workflow-guide__done-toggle');await act(async()=>toggle.click());assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(host.querySelector('progress').value,2);
}));
test('zero and full completion remain accurate in English, without creating a next action',async()=>mount(async(host,root)=>{
 for(const [state,count]of [['waiting',0],['done',5]]){
  await act(async()=>root.render(React.createElement(Guide,{lang:'en',showNext:false,model:{...model,next:undefined,steps:model.steps.map(s=>({...s,state}))}})));
  assert.equal(host.querySelector('progress').value,count);assert.ok(host.textContent.includes(`${count}/5 steps complete`));
  assert.equal(host.querySelector('.lv-workflow-guide__next'),null);
 }
}));
