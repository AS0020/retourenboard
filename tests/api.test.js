import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../server/app.js';
import { createAuth } from '../server/auth.js';
import {createStore} from '../server/store.js';
import {createUsers} from '../server/users.js';

async function fixture(t) {
  const app = createApp({dbPath:':memory:', secureCookies:false});
  await app.users.createFirst({username:'admin',displayName:'Testadmin',password:'Testpasswort-2026!'});
  app.store.createMasterData('suppliers',{name:'Nord',code:'privat',notes:'Adminnotiz'});
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  const request = (path, method = 'GET', data, auth = {}, extra = {}) => fetch(base+path, {
    method, headers:{Origin:base, 'Content-Type':'application/json', ...auth, ...extra}, body:data === undefined ? undefined : JSON.stringify(data)
  });
  const login = async () => {
    const res = await request('/api/login','POST',{username:'admin',password:'Testpasswort-2026!'});
    assert.equal(res.status,200);
    assert.match(res.headers.get('set-cookie'), /HttpOnly/);
    const body = await res.json();
    return {Cookie:res.headers.get('set-cookie').split(';')[0], 'X-CSRF-Token':body.csrfToken};
  };
  return {app,request,login};
}
test('theme assets are available before login with executable MIME types', async t => {
  const {request} = await fixture(t);
  for (const [path,type] of [['/theme.js','text/javascript'],['/theme.css','text/css']]) {
    const response=await request(path);
    assert.equal(response.status,200,path);
    assert.ok(response.headers.get('content-type').startsWith(type),path);
    assert.equal((await request(path,'HEAD')).status,200,path+' HEAD');
    assert.ok((await response.text()).length>0);
  }
});

test('all data reads and writes require a session', async t => {
  const {request} = await fixture(t);
  assert.equal((await request('/api/products')).status,401);
  assert.equal((await request('/api/returns')).status,401);
  for (const [path,method] of [['/api/products','POST'],['/api/products/1','PUT'],['/api/products/1','DELETE'],['/api/returns','POST'],['/api/import/preview','POST'],['/api/import/commit','POST']]) {
    assert.equal((await request(path,method,{})).status,401);
  }
});
test('login, CSRF, origin protection and logout protect mutations', async t => {
  const {request,login} = await fixture(t);
  assert.equal((await request('/api/login','POST',{username:'admin',password:'falsch'})).status,401);
  const auth = await login();
  assert.equal((await request('/api/products','POST',{name:'Test',sku:'A'}, {Cookie:auth.Cookie})).status,403);
  assert.equal((await request('/api/products','POST',{name:'Test',sku:'A'}, auth, {Origin:'https://fremd.example'})).status,403);
  const p = await request('/api/products','POST',{name:'Monitor',sku:'A',supplier:'Nord'},auth);
  assert.equal(p.status,201);
  assert.equal((await p.json()).supplier,'Nord');
  assert.equal((await request('/api/logout','POST',{},auth)).status,200);
  assert.equal((await request('/api/products','POST',{name:'Test',sku:'B'},auth)).status,401);
});
test('API edits returns and imports suppliers atomically', async t => {
  const {request,login} = await fixture(t); const auth = await login();
  const p = await (await request('/api/products','POST',{name:'Monitor',sku:'A'},auth)).json();
  const response = await request('/api/returns','POST',{productId:p.id,receiptDate:'2026-10-05',serialNumber:'SN-1'},auth);
  assert.equal(response.status,201); const r = await response.json();
  assert.equal((await request(`/api/returns/${r.id}`,'PUT',{...r,statusId:undefined,status:'Abgeschlossen'},auth)).status,200);
  assert.equal((await (await request('/api/returns','GET',undefined,auth)).json())[0].status,'Abgeschlossen');
  const csv = {kind:'products',text:'sku;name;supplier\nB;Tastatur;Nord',mapping:{sku:0,name:1,supplier:2},updateExisting:false};
  assert.equal((await request('/api/import/preview','POST',csv,auth)).status,200);
  assert.equal((await request('/api/import/commit','POST',csv,auth)).status,200);
  assert.equal((await request('/api/import/commit','POST',csv,auth)).status,400);
  assert.equal((await (await request(`/api/products/${p.id}`,'DELETE',{},auth)).json()).archived,true);
  const exported = await request('/api/export/products','GET',undefined,auth);
  assert.equal(exported.status,200); assert.match(await exported.text(), /Lieferant/);
});
test('invalid payloads are controlled errors and secrets are never served', async t => {
  const {request,login} = await fixture(t); const auth = await login();
  assert.equal((await request('/api/products','POST',null,auth)).status,400);
  assert.equal((await request('/api/products','POST',{name:'Test',sku:'A',price:'NaN'},auth)).status,400);
  assert.equal((await request('/.env')).status,404);
  assert.equal((await request('/server/auth.js')).status,404);
});
test('ten failed logins are followed by rate limiting', async t => {
  const {request} = await fixture(t);
  for (let i=0;i<10;i++) assert.equal((await request('/api/login','POST',{username:'admin',password:'falsch'})).status,401);
  assert.equal((await request('/api/login','POST',{username:'admin',password:'Testpasswort-2026!'})).status,429);
});
test('sessions expire after eight hours', async () => {
  let time = 0;
  const store=createStore(':memory:'),users=createUsers(store);await users.createFirst({username:'admin',password:'Testpasswort-2026!'});
  const auth = createAuth({users,now:() => time});
  const result = await auth.login({username:'admin',password:'Testpasswort-2026!'}, '127.0.0.1');
  assert.ok(auth.getSession(result.token));
  time = 8 * 60 * 60 * 1000 + 1;
  assert.equal(auth.getSession(result.token),null);store.close();
});

test('masterdata requires login and exposes internal fields to admins',async t=>{
  const {request,login}=await fixture(t);
  const res=await request('/api/masterdata');assert.equal(res.status,401);
  for(const [path,method] of [['/api/masterdata/suppliers','POST'],['/api/masterdata/1','PUT'],['/api/masterdata/1','DELETE']])assert.equal((await request(path,method,{})).status,401);
  const auth=await login();const admin=await(await request('/api/masterdata','GET',undefined,auth)).json();assert.equal(admin.suppliers[0].notes,'Adminnotiz');
  assert.equal((await request('/api/masterdata/categories','POST',{name:'Test'}, {Cookie:auth.Cookie})).status,403);
  const created=await request('/api/masterdata/suppliers','POST',{name:'West'},auth);assert.equal(created.status,201);const item=await created.json();
  assert.equal((await request(`/api/masterdata/${item.id}`,'PUT',{name:'West neu'},auth)).status,200);
  assert.equal((await request(`/api/masterdata/${item.id}`,'DELETE',{},auth)).status,200);
});

test('local PDF renderer assets are served and unrelated vendor paths stay private',async t=>{
  const {request}=await fixture(t);
  for(const path of ['/vendor/pdfjs/pdf.min.mjs','/vendor/pdfjs/pdf.worker.min.mjs','/pdf-preview.js'])assert.equal((await request(path)).status,200,path);
  assert.equal((await request('/vendor/pdfjs/package.json')).status,404);
});
