import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createStore} from '../server/store.js';

test('masterdata names are unique within their list and defaults remain usable',()=>{
  const s=createStore(':memory:');
  try{
    s.createMasterData('suppliers',{name:'Nord',code:'L-1'});
    assert.throws(()=>s.createMasterData('suppliers',{name:' nord '}));
    assert.equal(s.createMasterData('manufacturers',{name:'Nord'}).name,'Nord');
    const reasons=s.listMasterData().reasons;
    const next=s.updateMasterData(reasons[0].id,{...reasons[0],isDefault:true});
    assert.equal(next.isDefault,true);
    assert.equal(s.listMasterData().reasons.filter(x=>x.isDefault).length,1);
    for(const reason of s.listMasterData().reasons.slice(1))s.deleteMasterData(reason.id);
    assert.throws(()=>s.deleteMasterData(next.id));
  }finally{s.close();}
});
test('return supplier is optional and independent of the product supplier',()=>{
  const s=createStore(':memory:');
  try{
    const a=s.createMasterData('suppliers',{name:'A'}),b=s.createMasterData('suppliers',{name:'B'});
    const p=s.createProduct({sku:'P',name:'Produkt',supplierId:a.id});
    const r=s.createReturn({productId:p.id,receiptDate:'2026-10-05',supplierId:b.id});
    const empty=s.createReturn({productId:p.id,receiptDate:'2026-10-05',supplierId:null});
    assert.equal(empty.supplier,'');
    s.updateProduct(p.id,{...p,supplierId:b.id});
    assert.equal(s.getReturn(r.id).supplier,'B');
    const inherited=s.createReturn({productId:p.id,receiptDate:'2026-10-05'});
    assert.equal(inherited.supplier,'B');
    s.updateProduct(p.id,{...s.getProduct(p.id),supplierId:a.id});
    assert.equal(s.getReturn(inherited.id).supplier,'B');
    s.updateMasterData(b.id,{...b,name:'B neu'});
    assert.equal(s.getReturn(r.id).supplier,'B neu');
  }finally{s.close();}
});
test('archive keeps references and rejects new assignments and wrong list IDs',()=>{
  const s=createStore(':memory:');
  try{
    const supplier=s.createMasterData('suppliers',{name:'Nord'});
    const p=s.createProduct({sku:'P',name:'Produkt',supplierId:supplier.id});
    assert.equal(s.deleteMasterData(supplier.id).archived,true);
    assert.equal(s.getProduct(p.id).supplier,'Nord');
    s.updateProduct(p.id,{...s.getProduct(p.id),name:'Neuer Name'});
    assert.throws(()=>s.createProduct({sku:'P2',name:'Test',supplierId:supplier.id}));
    const maker=s.createMasterData('manufacturers',{name:'Marke'});
    assert.throws(()=>s.createProduct({sku:'P3',name:'Test',supplierId:maker.id}));
  }finally{s.close();}
});
test('custom closed statuses affect the returned workflow state',()=>{
  const s=createStore(':memory:');
  try{
    const status=s.createMasterData('statuses',{name:'Erledigt',isClosed:true,tone:'done'});
    const p=s.createProduct({sku:'P',name:'Produkt'});
    const r=s.createReturn({productId:p.id,receiptDate:'2026-10-05',statusId:status.id});
    assert.equal(r.isClosed,true);assert.equal(r.status,'Erledigt');
  }finally{s.close();}
});
