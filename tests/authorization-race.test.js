import {test} from 'node:test';
import assert from 'node:assert/strict';
import {request as httpRequest} from 'node:http';
import {once} from 'node:events';
import {createApp} from '../server/app.js';

async function fixture(t){
  const app=createApp({dbPath:':memory:'});await app.users.createFirst({username:'owner',password:'Parallel-Testpasswort!'});await app.users.create({username:'second',role:'admin',password:'Parallel-Testpasswort!'});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());const base=`http://127.0.0.1:${app.server.address().port}`;
  const request=(path,body,auth)=>fetch(base+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...auth},body:JSON.stringify(body)});
  const login=await request('/api/login',{username:'second',password:'Parallel-Testpasswort!'}),data=await login.json();
  const auth={Cookie:login.headers.get('set-cookie').split(';')[0],'X-CSRF-Token':data.csrfToken};return {app,base,request,auth,id:data.user.id};
}
test('revoked admin cannot create an account after a pending hash completes',async t=>{
  const {app,request,auth,id}=await fixture(t);
  let started;const hashing=new Promise(r=>started=r),create=app.users.create;
  app.users.create=(...args)=>{const pending=create(...args);started();return pending;};
  const pending=request('/api/users',{username:'unauthorized',role:'admin',password:'Parallel-Testpasswort!'},auth);
  // Observe entry into the real repository's async password derivation; no fake result.
  await hashing;
  await app.users.update(id,{role:'member'});
  assert.equal((await pending).status,403);
  assert.equal(app.users.credentialsByName('unauthorized'),null);
});
test('revoked admin cannot save masterdata after a delayed request body',async t=>{
  const {app,base,auth,id}=await fixture(t);
  const arrived=once(app.server,'request');
  let finish;const response=new Promise((resolve,reject)=>{
    const req=httpRequest(base+'/api/masterdata/suppliers',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',...auth}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});req.on('error',reject);req.write('{"name":');finish=()=>req.end('"Forbidden supplier"}');
  });
  await arrived;await app.users.update(id,{role:'member'});finish();
  assert.equal(await response,403);assert.equal(app.store.listMasterData().suppliers.length,0);
});
