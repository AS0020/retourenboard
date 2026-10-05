import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server/app.js';

async function fixture(t){
  const app=createApp({dbPath:':memory:',password:'Legacy-Must-Not-Work!'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,method='GET',body,auth={},extra={})=>fetch(base+path,{method,headers:{Origin:base,'Content-Type':'application/json',...auth,...extra},body:body===undefined?undefined:JSON.stringify(body)});
  const credentials={username:'Admin',displayName:'Erster Admin',password:'Testkonto-Passwort!'};
  function headers(res,data){return {Cookie:res.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};}
  async function setup(){const res=await request('/api/setup','POST',credentials);assert.equal(res.status,201);const data=await res.json();return {auth:headers(res,data),data};}
  async function login(username,password=credentials.password){const res=await request('/api/login','POST',{username,password});assert.equal(res.status,200);const data=await res.json();return {auth:headers(res,data),data};}
  return {app,request,setup,login,credentials};
}
test('setup is origin-protected, atomic, once-only and creates the first admin',async t=>{
  const {request,credentials}=await fixture(t);assert.equal((await(await request('/api/session')).json()).setupRequired,true);
  assert.equal((await request('/api/setup','POST',credentials,{}, {Origin:'https://anders.example'})).status,403);
  const results=await Promise.all([request('/api/setup','POST',credentials),request('/api/setup','POST',{...credentials,username:'Anderer'})]);
  assert.deepEqual(results.map(x=>x.status).sort(),[201,409]);const data=await results.find(x=>x.status===201).json();assert.equal(data.user.role,'admin');assert.equal(data.user.passwordHash,undefined);
  assert.equal((await(await request('/api/session')).json()).setupRequired,false);assert.equal((await request('/api/setup','POST',credentials)).status,409);
  assert.equal((await request('/api/login','POST',{password:'Legacy-Must-Not-Work!'})).status,401);
});
test('personal login uses normalized usernames and logout invalidates the cookie',async t=>{
  const {request,setup,login}=await fixture(t);await setup();
  const bad=await request('/api/login','POST',{username:'admin',password:'falsch'}),unknown=await request('/api/login','POST',{username:'unknown',password:'falsch'});assert.equal(bad.status,401);assert.deepEqual(await bad.json(),await unknown.json());
  const {auth,data}=await login(' ADMIN ');assert.equal(data.user.username,'Admin');
  assert.equal((await(await request('/api/session','GET',undefined,auth)).json()).unlocked,true);
  assert.equal((await request('/api/logout','POST',{},auth)).status,200);assert.equal((await request('/api/products','POST',{name:'Test',sku:'A'},auth)).status,401);
});
test('members edit shared data but accounts and masterdata are admin-only',async t=>{
  const {request,setup,login}=await fixture(t),{auth}=await setup();
  assert.equal((await request('/api/users')).status,401);
  assert.equal((await request('/api/users','POST',{username:'Worker',password:'Testkonto-Passwort!'}, {Cookie:auth.Cookie})).status,403);
  const res=await request('/api/users','POST',{username:'Worker',displayName:'Mitarbeiter',password:'Testkonto-Passwort!'},auth);assert.equal(res.status,201);const worker=await res.json();assert.equal(worker.role,'member');
  const member=(await login('worker')).auth;
  for(const [path,method,body]of [['/api/users','GET'],['/api/users','POST',{username:'Hack',password:'Testkonto-Passwort!',role:'admin'}],[`/api/users/${worker.id}`,'PUT',{role:'admin'}],['/api/masterdata/suppliers','POST',{name:'Nord'}],['/api/masterdata/1','PUT',{name:'Neu'}],['/api/masterdata/1','DELETE']])assert.equal((await request(path,method,body,member)).status,403,path);
  assert.equal((await request('/api/products','POST',{sku:'A',name:'Produkt'},member)).status,201);
  assert.equal((await request('/api/import/preview','POST',{kind:'products',text:'sku;name\nB;Test',mapping:{sku:0,name:1}},member)).status,200);
  const supplier=await(await request('/api/masterdata/suppliers','POST',{name:'Nord',code:'Intern',notes:'Privat'},auth)).json();
  for(const session of [member]){const value=(await(await request('/api/masterdata','GET',undefined,session)).json()).suppliers.find(x=>x.id===supplier.id);assert.equal(value.notes,undefined);assert.equal(value.code,undefined);}
  const accounts=await(await request('/api/users','GET',undefined,auth)).json();assert.equal(accounts.length,2);assert.equal(JSON.stringify(accounts).includes('passwordHash'),false);
});
test('deactivation, role changes and password reset affect existing sessions immediately',async t=>{
  const {request,setup,login}=await fixture(t),{auth}=await setup();const worker=await(await request('/api/users','POST',{username:'Worker',password:'Testkonto-Passwort!'},auth)).json();const member=(await login('worker')).auth;
  assert.equal((await request(`/api/users/${worker.id}`,'PUT',{role:'admin'},auth)).status,200);assert.equal((await request('/api/users','GET',undefined,member)).status,200);
  assert.equal((await request(`/api/users/${worker.id}`,'PUT',{role:'member'},auth)).status,200);assert.equal((await request('/api/users','GET',undefined,member)).status,403);
  assert.equal((await request(`/api/users/${worker.id}`,'PUT',{active:false},auth)).status,200);assert.equal((await request('/api/products','POST',{sku:'A',name:'Test'},member)).status,401);
  assert.equal((await request('/api/login','POST',{username:'worker',password:'Testkonto-Passwort!'})).status,401);
  assert.equal((await request(`/api/users/${worker.id}`,'PUT',{active:true,password:'Neues-Testpasswort!'},auth)).status,200);const fresh=(await login('worker','Neues-Testpasswort!')).auth;
  assert.equal((await request(`/api/users/${worker.id}`,'PUT',{password:'Noch-ein-Testpasswort!'},auth)).status,200);assert.equal((await(await request('/api/session','GET',undefined,fresh)).json()).unlocked,false);
});
test('own password change requires current password and forces a new login',async t=>{
  const {request,setup,login}=await fixture(t),{auth,data}=await setup();
  assert.equal((await request(`/api/users/${data.user.id}`,'PUT',{active:false},auth)).status,400);
  assert.equal((await request(`/api/users/${data.user.id}`,'PUT',{role:'member'},auth)).status,400);
  assert.equal((await request('/api/account/password','POST',{currentPassword:'Falsch',newPassword:'Neues-Testpasswort!'},auth)).status,401);
  assert.equal((await request('/api/account/password','POST',{currentPassword:'Testkonto-Passwort!',newPassword:'Neues-Testpasswort!'},auth)).status,200);
  assert.equal((await(await request('/api/session','GET',undefined,auth)).json()).unlocked,false);
  assert.equal((await request('/api/login','POST',{username:'admin',password:'Testkonto-Passwort!'})).status,401);await login('admin','Neues-Testpasswort!');
});
