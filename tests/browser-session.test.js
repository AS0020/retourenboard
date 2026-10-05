import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Exercise the real browser controller against a small DOM/network boundary.
// No browser or real account credentials are involved.
function controller(fetch){
  const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const start=source.indexOf('const ctx={'),end=source.indexOf('\nfunction updateAccess',start);
  const state={products:[{name:'Secret'}],returns:[{serialNumber:'Secret'}],masterdata:{suppliers:[{name:'Secret'}]},session:{unlocked:true,user:{id:1},csrfToken:'valid'}};
  let renders=0;
  const doc={querySelector:selector=>selector==='#dialog'?{open:false}:{textContent:''}};
  const ctx=new Function('state','fetch','document','updateAccess','render','loginDialog',source.slice(start,end)+';return ctx;')(state,fetch,doc,()=>{},()=>renders++,()=>{});
  return {ctx,state,renders:()=>renders};
}
const result=(status,data)=>({ok:status===200,status,json:async()=>data});
test('logged-out refresh clears cached data without requesting protected endpoints',async()=>{
  const calls=[];const {ctx,state,renders}=controller(async path=>{calls.push(path);return result(200,{unlocked:false,user:null,setupRequired:false});});
  await ctx.reload();assert.deepEqual(calls,['/api/session']);assert.deepEqual(state.products,[]);assert.deepEqual(state.returns,[]);assert.deepEqual(state.masterdata,{});assert.ok(renders()>0);
});
test('wrong current password retains the valid session for a corrected retry',async()=>{
  let attempts=0;const session={unlocked:true,user:{id:1},csrfToken:'valid'};
  const {ctx,state}=controller(async(path,options)=>{
    if(path==='/api/session')return result(200,session);
    assert.equal(options.headers['X-CSRF-Token'],'valid');
    return attempts++===0?result(401,{error:'Current password incorrect'}):result(200,{unlocked:false});
  });
  await assert.rejects(ctx.api('/api/account/password',{method:'POST',body:{currentPassword:'bad'}}),/incorrect/);
  assert.equal(state.session.csrfToken,'valid');assert.equal(state.session.unlocked,true);
  assert.equal((await ctx.api('/api/account/password',{method:'POST',body:{currentPassword:'correct'}})).unlocked,false);
});
