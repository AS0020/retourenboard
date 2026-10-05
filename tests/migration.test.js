import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../server/store.js';
test('V1 database migration preserves records and never reapplies supplier defaults',()=>{
  const dir=mkdtempSync(join(tmpdir(),'retouren-migration-')),path=join(dir,'data.sqlite');
  const db=new DatabaseSync(path);
  db.exec(`CREATE TABLE products(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT,sku TEXT UNIQUE,ean TEXT,manufacturer TEXT,supplier TEXT,category TEXT,priceCents INTEGER,description TEXT,active INTEGER,createdAt TEXT,updatedAt TEXT);
  CREATE TABLE returns(id INTEGER PRIMARY KEY AUTOINCREMENT,productId INTEGER,returnNumber TEXT UNIQUE,serialNumber TEXT,orderNumber TEXT,receiptDate TEXT,quantity INTEGER,reason TEXT,condition TEXT,status TEXT,resolution TEXT,notes TEXT,createdAt TEXT,updatedAt TEXT);
  INSERT INTO products VALUES(1,'Altprodukt','ALT','','Marke','Altlieferant','Altgruppe',500,'',1,'2026-10-05','2026-10-05');
  INSERT INTO returns VALUES(1,1,'R-ALT','','','2026-10-05',1,'Sonstiges','Ungeprüft','Abgeschlossen','Noch offen','','2026-10-05','2026-10-05');`);db.close();
  let s=createStore(path);
  try{
    assert.equal(s.listProducts().length,1);assert.equal(s.listReturns().length,1);
    assert.equal(s.getReturn(1).supplier,'Altlieferant');assert.equal(s.getReturn(1).isClosed,true);
    s.updateReturn(1,{...s.getReturn(1),supplierId:null});
    const before=s.listMasterData().suppliers.length;s.close();s=createStore(path);
    assert.equal(s.getReturn(1).supplier,'');assert.equal(s.listMasterData().suppliers.length,before);
  }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
