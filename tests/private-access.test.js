import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';

test('all inventory, CSV and file reads require a personal session',async t=>{
  const app=createApp({dbPath:':memory:'});await app.users.createFirst({username:'admin',password:'Privater-Testzugang!'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const login=await fetch(base+'/api/login',{method:'POST',headers:{Origin:base,'Content-Type':'application/json'},body:JSON.stringify({username:'admin',password:'Privater-Testzugang!'})});
  const session=await login.json(),headers={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':session.csrfToken,Origin:base};
  const p=app.store.createProduct({name:'Privater Monitor',sku:'PRIVAT'}),r=app.store.createReturn({productId:p.id,receiptDate:'2026-10-05'});
  const upload=await fetch(base+`/api/returns/${r.id}/attachments`,{method:'POST',headers:{...headers,'X-File-Name':'privat.pdf','Content-Type':'application/octet-stream'},body:Buffer.from('%PDF-1.4\n%%EOF')});assert.equal(upload.status,201);const attachment=await upload.json();
  const paths=['/api/products',`/api/products/${p.id}`,'/api/returns',`/api/returns/${r.id}`,'/api/masterdata','/api/export/products','/api/export/returns','/api/template/products','/api/template/returns',`/api/returns/${r.id}/attachments`,`/api/attachments/${attachment.id}/preview`,`/api/attachments/${attachment.id}/download`];
  for(const path of paths){
    const anonymous=await fetch(base+path);assert.equal(anonymous.status,401,path);assert.equal((await anonymous.json()).error,'Bitte zuerst anmelden.');
    assert.equal((await fetch(base+path,{headers})).status,200,path);
  }
  for(const suffix of ['preview','download'])assert.equal((await fetch(base+`/api/attachments/${attachment.id}/${suffix}`,{method:'HEAD'})).status,401);
  assert.equal((await fetch(base+'/api/session')).status,200);assert.equal((await fetch(base+'/')).status,200);
  await fetch(base+'/api/logout',{method:'POST',headers});
  for(const path of paths)assert.equal((await fetch(base+path,{headers})).status,401,path+' after logout');
});
