import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
const dom=new JSDOM('<body></body>',{url:'http://localhost'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const output=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/legal/LegalDocumentRequestFields.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(output)?output[0]:output).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const {default:Fields}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
async function mount(fn){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await fn(host,root);}finally{await act(async()=>root.unmount());host.remove();}}
test('selecting a draft preserves custom text until explicitly applied and remains editable',async()=>mount(async(host,root)=>{
 function Harness(){const [reason,setReason]=React.useState('Nội dung đang nhập');return React.createElement(Fields,{reason,onChange:setReason});}
 await act(async()=>root.render(React.createElement(Harness)));
 const select=host.querySelector('select'),button=host.querySelector('button'),area=host.querySelector('textarea');
 assert.equal(button.disabled,true);
 await act(async()=>{select.value='distribution';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.equal(area.value,'Nội dung đang nhập');assert.match(button.textContent,/Thay nội dung/);
 await act(async()=>button.click());assert.match(area.value,/giấy tờ phân chia di sản hợp lệ/);
 assert.equal(area.maxLength,1000);assert.equal(area.required,true);assert.equal(area.disabled,false);
}));
test('pending disables selection, apply and editing; English is supported',async()=>mount(async(host,root)=>{
 await act(async()=>root.render(React.createElement(Fields,{lang:'en',reason:'Draft',disabled:true,onChange:()=>assert.fail('pending write')})));
 for(const field of host.querySelectorAll('select,button,textarea'))assert.equal(field.disabled,true);
 assert.match(host.textContent,/Request sent to Staff/);
}));
