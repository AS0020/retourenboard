import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.js';

async function repository(store){const {createUsers}=await import('../server/users.js');return createUsers(store);}
const adminInput={username:'Chef',displayName:'Administrator',password:'Sicheres-Testpasswort!'};
test('first administrator is atomic and never opens again',async()=>{
  const store=createStore(':memory:');try{
    const users=await repository(store);assert.equal(users.setupRequired(),true);
    const results=await Promise.allSettled([users.createFirst(adminInput),users.createFirst({...adminInput,username:'Chef2'})]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(users.list().length,1);assert.equal(users.list()[0].role,'admin');assert.equal(users.setupRequired(),false);
    await assert.rejects(()=>users.createFirst({...adminInput,username:'Chef3'}));
  }finally{store.close();}
});
test('usernames are unique and profiles never contain credentials',async()=>{
  const store=createStore(':memory:');try{
    const users=await repository(store);await users.createFirst(adminInput);
    await assert.rejects(()=>users.create({...adminInput,username:' cHeF '}));
    const p=await users.create({...adminInput,username:'Mitarbeiter',role:'member'});
    assert.equal(p.role,'member');assert.equal(p.passwordHash,undefined);assert.equal(p.passwordSalt,undefined);assert.equal(p.authVersion,undefined);
    const a=users.credentialsByName('CHEF'),b=users.credentialsByName('mitarbeiter');assert.notEqual(a.passwordHash,b.passwordHash);assert.notEqual(a.passwordSalt,b.passwordSalt);
    assert.equal(JSON.stringify(users.list()).includes('passwordHash'),false);
    await assert.rejects(()=>users.create({...adminInput,username:'abc',role:'superadmin'}));
    await assert.rejects(()=>users.create({...adminInput,username:'abc',password:'zu kurz'}));
  }finally{store.close();}
});
test('last active admin survives deactivation and simultaneous demotions',async()=>{
  const store=createStore(':memory:');try{
    const users=await repository(store),a=await users.createFirst(adminInput);
    await assert.rejects(()=>users.update(a.id,{active:false}));await assert.rejects(()=>users.update(a.id,{role:'member'}));
    const b=await users.create({...adminInput,username:'ZweiterAdmin',role:'admin'});
    const results=await Promise.allSettled([users.update(a.id,{role:'member',password:'Neues-Testpasswort1!'}),users.update(b.id,{role:'member',password:'Neues-Testpasswort2!'})]);
    assert.equal(results.filter(x=>x.status==='fulfilled').length,1);assert.equal(users.list().filter(u=>u.active&&u.role==='admin').length,1);
  }finally{store.close();}
});
test('password changes verify old password, invalidate sessions and persist after reopen',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'retouren-users-')),file=join(dir,'users.sqlite');let store=createStore(file);
  try{
    let users=await repository(store);const a=await users.createFirst(adminInput),before=users.credentialsById(a.id);
    await assert.rejects(()=>users.changePassword(a.id,'Falsch','Neues-Testpasswort!'));
    await users.changePassword(a.id,adminInput.password,'Neues-Testpasswort!');const after=users.credentialsById(a.id);assert.equal(after.authVersion,before.authVersion+1);assert.notEqual(after.passwordHash,before.passwordHash);
    store.close();store=createStore(file);users=await repository(store);assert.equal(users.setupRequired(),false);assert.equal(users.credentialsById(a.id).passwordHash,after.passwordHash);
    const {verifyPassword}=await import('../server/users.js');assert.equal(await verifyPassword('Neues-Testpasswort!',users.credentialsById(a.id)),true);
  }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
