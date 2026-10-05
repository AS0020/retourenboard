import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.js';

const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=','base64');
async function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'retouren-files-')),dbPath=join(dir,'data.sqlite');
  let app,base;
  async function start(){app=createApp({dbPath,});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));base=`http://127.0.0.1:${app.server.address().port}`;}
  await start();await app.users.createFirst({username:'admin',password:'Datei-Testpasswort!'});const p=app.store.createProduct({name:'Test',sku:'A'}),ret=app.store.createReturn({productId:p.id,receiptDate:'2026-10-05'});
  const request=(path,method='GET',body,headers={})=>fetch(base+path,{method,headers:{Origin:base,...headers},body});
  async function login(){const res=await request('/api/login','POST',JSON.stringify({username:'admin',password:'Datei-Testpasswort!'}),{'Content-Type':'application/json'});const data=await res.json();return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};}
  const upload=(name,data=png,auth={})=>request(`/api/returns/${ret.id}/attachments`,'POST',data,{'Content-Type':'application/octet-stream','X-File-Name':encodeURIComponent(name),...auth});
  t.after(async()=>{await app.close();rmSync(dir,{recursive:true,force:true});});
  return {dir,ret,request,upload,login,restart:async()=>{await app.close();await start();}};
}
test('attachments, upload and delete require personal login; mutations require CSRF and same origin',async t=>{
  const {ret,request,upload,login}=await fixture(t);const auth=await login();
  assert.equal((await upload('bild.png')).status,401);
  assert.equal((await upload('bild.png',png,{Cookie:auth.Cookie})).status,403);
  assert.equal((await upload('bild.png',png,{...auth,Origin:'https://fremd.example'})).status,403);
  const response=await upload('Prüfung.png',png,auth);assert.equal(response.status,201);const item=await response.json();
  const list=await(await request(`/api/returns/${ret.id}/attachments`,'GET',undefined,auth)).json();assert.equal(list[0].originalName,'Prüfung.png');assert.equal(list[0].storedName,undefined);
  const preview=await request(`/api/attachments/${item.id}/preview`,'GET',undefined,auth);assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await preview.arrayBuffer()),png);
  assert.equal(preview.headers.get('x-frame-options'),'SAMEORIGIN');
  const download=await request(`/api/attachments/${item.id}/download`,'GET',undefined,auth);assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.match(download.headers.get('content-disposition'),/filename\*=UTF-8''/);
  assert.equal((await request(`/api/attachments/${item.id}`,'DELETE')).status,401);
  assert.equal((await request(`/api/attachments/${item.id}`,'DELETE',undefined,auth)).status,200);
  assert.equal((await request(`/api/attachments/${item.id}/preview`,'GET',undefined,auth)).status,404);
});
test('type signatures, extensions, paths, size and per-return count are enforced',async t=>{
  const {dir,request,upload,login}=await fixture(t);const auth=await login();
  for(const [name,data]of [['x.svg',Buffer.from('<svg/>')],['x.png',Buffer.from('<html>')],['x.pdf',png],['../x.png',png],['x\r\n.png',png]])assert.equal((await upload(name,data,auth)).status,400,name);
  assert.equal((await request('/api/returns/999/attachments','POST',png,{...auth,'X-File-Name':'x.png'})).status,404);
  const huge=Buffer.alloc(10*1024*1024+1);png.copy(huge);assert.equal((await upload('huge.png',huge,auth)).status,413);
  for(const [name,data,type]of [['x.pdf',Buffer.from('%PDF-1.4\n%%EOF'),'application/pdf'],['x.jpg',Buffer.from([255,216,255,224,0,0,255,217]),'image/jpeg'],['x.webp',Buffer.from('RIFF0000WEBPVP8 '),'image/webp']]){
    const res=await upload(name,data,auth);assert.equal(res.status,201);assert.equal((await res.json()).mediaType,type);
  }
  for(let i=0;i<7;i++)assert.equal((await upload(`bild${i}.png`,png,auth)).status,201);
  assert.equal((await upload('elf.png',png,auth)).status,400);
  assert.equal(readdirSync(join(dir,'attachments')).length,10);
});
test('attachments survive restart and deleting a return removes its files',async t=>{
  const {dir,ret,upload,request,login,restart}=await fixture(t);let auth=await login();const item=await(await upload('bild.png',png,auth)).json();
  await restart();auth=await login();assert.equal((await request(`/api/attachments/${item.id}/preview`,'GET',undefined,auth)).status,200);
  assert.equal((await request(`/api/returns/${ret.id}`,'DELETE',undefined,auth)).status,200);
  assert.equal((await request(`/api/attachments/${item.id}/preview`,'GET',undefined,auth)).status,404);assert.equal(readdirSync(join(dir,'attachments')).length,0);
});

test('JPEG extension also accepts uppercase .JPEG and serves image/jpeg',async t=>{
  const {upload,request,login}=await fixture(t);const auth=await login();
  const response=await upload('Prüffoto.JPEG',Buffer.from([255,216,255,224,0,0,255,217]),auth);
  assert.equal(response.status,201);const file=await response.json();assert.equal(file.mediaType,'image/jpeg');
  const preview=await request(`/api/attachments/${file.id}/preview`,'GET',undefined,auth);assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/jpeg');
});
