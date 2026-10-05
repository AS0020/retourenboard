import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStore } from '../server/store.js';

test('SKU uniqueness is enforced and product changes persist', () => {
  const store = createStore(':memory:');
  try {
    store.createMasterData('suppliers',{name:'Lieferant A'});store.createMasterData('suppliers',{name:'Lieferant B'});
    const p = store.createProduct({name:'Monitor', sku:'M-1', supplier:'Lieferant A'});
    assert.throws(() => store.createProduct({name:'Duplicate', sku:'M-1'}));
    store.updateProduct(p.id, {...p, supplierId:undefined, supplier:'Lieferant B'});
    assert.equal(store.getProduct(p.id).supplier, 'Lieferant B');
  } finally { store.close(); }
});
test('linked products archive and returns retain product information', () => {
  const store = createStore(':memory:');
  try {
    const p = store.createProduct({name:'Monitor', sku:'M-1'});
    const r = store.createReturn({productId:p.id, receiptDate:'2026-10-05', serialNumber:'ABC'});
    assert.match(r.returnNumber, /^RET-\d{4}-\d{6,}$/);
    assert.equal(store.deleteProduct(p.id).archived, true);
    assert.equal(store.getProduct(p.id).active, false);
    assert.equal(store.listReturns()[0].productName, 'Monitor');
    assert.throws(() => store.createReturn({productId:p.id, receiptDate:'2026-10-05'}));
    store.updateReturn(r.id, {...r, statusId:undefined, status:'Abgeschlossen'});
    assert.equal(store.getReturn(r.id).status, 'Abgeschlossen');
  } finally { store.close(); }
});
test('database data survives reopening and transactions roll back', () => {
  const dir = mkdtempSync(join(tmpdir(), 'retouren-test-'));
  const file = join(dir, 'test.sqlite');
  let store = createStore(file);
  try {
    store.createProduct({name:'Bestand', sku:'P-1'});
    assert.throws(() => store.transaction(() => {
      store.createProduct({name:'Neu', sku:'P-2'});
      throw new Error('abbruch');
    }));
    store.close(); store = createStore(file);
    assert.equal(store.listProducts().length, 1);
    assert.equal(store.listProducts()[0].sku, 'P-1');
  } finally { store.close(); rmSync(dir, {recursive:true, force:true}); }
});
