import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createImportSession } from '../shared/import-session.js';

test('a response for an obsolete mapping cannot authorize an import', () => {
  const session=createImportSession();
  const old=session.begin({kind:'products',mapping:{sku:0,name:1},text:'sku;name\nA;Test'});
  session.invalidate();
  assert.equal(session.accept(old,{errors:[],rows:[{line:2}]}),false);
  assert.equal(session.getCommitPayload(),null);
});
test('commit uses exactly the payload accepted by the preview', () => {
  const session=createImportSession();
  const input={kind:'products',mapping:{sku:0,name:1},text:'sku;name\nA;Test'};
  const pending=session.begin(input);
  input.mapping.name=0;input.text='sku;name\nB;Autre';
  assert.equal(session.accept(pending,{errors:[],rows:[{line:2}]}),true);
  assert.deepEqual(session.getCommitPayload(),{kind:'products',mapping:{sku:0,name:1},text:'sku;name\nA;Test'});
  session.invalidate();assert.equal(session.getCommitPayload(),null);
});
test('a failed or superseded preview never enables commit', () => {
  const session=createImportSession();
  const a=session.begin({text:'old'}), b=session.begin({text:'new'});
  assert.equal(session.accept(a,{errors:[],rows:[{}]}),false);
  assert.equal(session.accept(b,{errors:[{line:2}],rows:[]}),true);
  assert.equal(session.getCommitPayload(),null);
});
