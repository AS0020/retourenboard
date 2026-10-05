import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, exportCsv } from '../shared/csv.js';
import { previewImport, commitImport } from '../server/import.js';
import { createStore } from '../server/store.js';

test('CSV parser preserves BOM, zeros, quoted separators, quotes and line breaks', () => {
  const parsed = parseCsv('\uFEFFArtikelnummer;Produktname;Lieferant;EAN\r\nA-1;"Monitor; groß";"Firma ""Nord""\nBerlin";0012345678905\r\n');
  assert.deepEqual(parsed.headers, ['Artikelnummer','Produktname','Lieferant','EAN']);
  assert.deepEqual(parsed.rows[0], {line:2, values:['A-1','Monitor; groß','Firma "Nord"\nBerlin','0012345678905']});
  assert.equal(parseCsv('sku,name\nA,Test').rows[0].values[1], 'Test');
});
test('CSV rejects malformed quotes, duplicate headers and inconsistent columns', () => {
  for (const value of ['a;b\n"offen;b', 'a;a\n1;2', 'a;b\n1;2;3', 'a;b\n"x"y;z']) assert.throws(() => parseCsv(value));
});
test('CSV export quotes cells and blocks spreadsheet formulas', () => {
  const parsed = parseCsv(exportCsv(['Name','EAN'], [['=HYPERLINK("x")','0012345678905'], ['safe;value','+42']]));
  assert.equal(parsed.rows[0].values[0], '\'=HYPERLINK("x")');
  assert.equal(parsed.rows[0].values[1], '0012345678905');
  assert.equal(parsed.rows[1].values[0], 'safe;value');
  assert.equal(parsed.rows[1].values[1], '\'+42');
});
test('product imports preview supplier, preserve zeros and require explicit updates', () => {
  const store = createStore(':memory:');
  try {
    store.createMasterData('suppliers',{name:'Nord'});store.createMasterData('suppliers',{name:'Süd'});
    const text = 'Artikelnummer;Produktname;Lieferant;EAN;Preis\nA-1;Monitor;Nord;0012345678905;29,95';
    const mapping = {sku:0,name:1,supplier:2,ean:3,price:4};
    assert.equal(previewImport(store,'products',text,mapping,false).rows[0].data.supplier, 'Nord');
    assert.equal(commitImport(store,'products',text,mapping,false).created, 1);
    assert.equal(store.findProduct('A-1').priceCents, 2995);
    assert.equal(previewImport(store,'products',text,mapping,false).errors.length, 1);
    assert.equal(commitImport(store,'products',text.replace('Nord','Süd'),mapping,true).updated, 1);
    assert.equal(store.findProduct('A-1').supplier, 'Süd');
  } finally { store.close(); }
});

test('CSV validates masterdata in preview and supports optional return suppliers and custom statuses',()=>{
  const s=createStore(':memory:');
  try{
    const a=s.createMasterData('suppliers',{name:'Nord'});s.createMasterData('suppliers',{name:'Süd'});
    s.createMasterData('statuses',{name:'Erledigt',isClosed:true});s.createProduct({sku:'A',name:'Test',supplierId:a.id});s.createProduct({sku:'B',name:'Ohne'});
    assert.equal(previewImport(s,'products','sku;name;supplier\nC;Neu;Unbekannt',{sku:0,name:1,supplier:2}).errors.length,1);
    assert.throws(()=>commitImport(s,'products','sku;name;supplier\nC;Neu;Nord\nD;Neu;Unbekannt',{sku:0,name:1,supplier:2}));assert.equal(s.listProducts().length,2);
    commitImport(s,'returns','sku;date;supplier;status\nA;2026-10-05;Süd;Erledigt\nA;2026-10-05;;Eingegangen',{sku:0,receiptDate:1,supplier:2,status:3});
    assert.equal(s.listReturns().find(x=>x.isClosed).supplier,'Süd');assert.equal(s.listReturns().find(x=>!x.isClosed).supplier,'');
    commitImport(s,'returns','sku;date\nA;2026-10-05\nB;2026-10-05',{sku:0,receiptDate:1});
    assert.equal(s.listReturns().find(x=>x.sku==='B').supplier,'');assert.ok(s.listReturns().some(x=>x.supplier==='Nord'));
    commitImport(s,'products','sku;name\nA;Umbenannt',{sku:0,name:1},true);assert.equal(s.findProduct('A').supplier,'Nord');
  }finally{s.close();}
});
test('failed and duplicate imports never partially save', () => {
  const store = createStore(':memory:');
  try {
    const mapping = {sku:0,name:1};
    assert.throws(() => commitImport(store,'products','sku;name\nA;Test\nB;',mapping,false));
    assert.equal(store.listProducts().length, 0);
    assert.throws(() => commitImport(store,'products','sku;name\nA;Test\nA;Duplikat',mapping,false));
    assert.equal(store.listProducts().length, 0);
  } finally { store.close(); }
});
test('return imports link by SKU and detect duplicate return numbers', () => {
  const store = createStore(':memory:');
  try {
    store.createProduct({sku:'A',name:'Monitor'});
    const mapping = {sku:0,receiptDate:1,returnNumber:2,serialNumber:3};
    const text = 'sku;date;number;serial\nA;2026-10-05;R-1;SN01';
    assert.equal(commitImport(store,'returns',text,mapping,false).created, 1);
    assert.equal(store.listReturns()[0].serialNumber, 'SN01');
    assert.throws(() => commitImport(store,'returns',text,mapping,false));
    assert.equal(store.listReturns().length, 1);
  } finally { store.close(); }
});
