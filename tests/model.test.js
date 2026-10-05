import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateProduct, validateReturn } from '../shared/model.js';

test('products keep leading EAN zeros and the supplier', () => {
  const p = validateProduct({ name: ' Kopfhörer ', sku: 'A-1', ean: '0012345678905', supplier: 'Nordhandel', price: '29,95' });
  assert.equal(p.ean, '0012345678905');
  assert.equal(p.supplier, 'Nordhandel');
  assert.equal(p.priceCents, 2995);
  assert.equal(p.name, 'Kopfhörer');
});
test('invalid product identifiers and prices are rejected', () => {
  for (const fields of [{name:''}, {sku:''}, {ean:'abcdef'}, {price:'-2'}, {price:'1e3'}, {price:'1.005'}]) {
    assert.throws(() => validateProduct({name:'Test', sku:'T-1', ...fields}));
  }
});
test('returns reject impossible dates, quantities and unknown statuses', () => {
  for (const fields of [{receiptDate:'2026-02-30'}, {quantity:0}, {quantity:1.5}, {status:'Unsinn'}, {productId:0}]) {
    assert.throws(() => validateReturn({productId:1, receiptDate:'2026-10-05', ...fields}));
  }
});
test('returns normalize identifiers and default the workflow', () => {
  const r = validateReturn({productId:1, receiptDate:'2026-10-05', serialNumber:' SN-007 '});
  assert.equal(r.serialNumber, 'SN-007');
  assert.equal(r.status, 'Eingegangen');
  assert.equal(r.quantity, 1);
});
test('nondecimal quantity and nonnumeric price input types are rejected', () => {
  for(const quantity of [true,[2],'0x10','1e2','',null]) {
    assert.throws(()=>validateReturn({productId:1,receiptDate:'2026-10-05',quantity}));
  }
  for(const price of [[12],true,{},null]) assert.throws(()=>validateProduct({name:'Test',sku:'A',price}));
});
