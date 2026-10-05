import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { validateProduct, validateReturn, InputError, PRODUCT_REFS, RETURN_REFS } from '../shared/model.js';
import {migrateDatabase} from './migrate.js';
import {createMasterDataRepository} from './masterdata.js';

export function createStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), {recursive:true});
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT NOT NULL UNIQUE,
      ean TEXT NOT NULL, manufacturer TEXT NOT NULL, supplier TEXT NOT NULL, category TEXT NOT NULL,
      priceCents INTEGER NOT NULL, description TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS returns (
      id INTEGER PRIMARY KEY AUTOINCREMENT, productId INTEGER NOT NULL REFERENCES products(id),
      returnNumber TEXT UNIQUE, serialNumber TEXT NOT NULL, orderNumber TEXT NOT NULL,
      receiptDate TEXT NOT NULL, quantity INTEGER NOT NULL, reason TEXT NOT NULL,
      condition TEXT NOT NULL, status TEXT NOT NULL, resolution TEXT NOT NULL, notes TEXT NOT NULL,
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );`);
  migrateDatabase(db);
  const masters=createMasterDataRepository(db);
  function display(row,refs) {
    if(!row)return null;
    const result={...row};
    if(refs===PRODUCT_REFS)result.active=!!row.active;
    for(const field of Object.keys(refs))result[field]=masters.get(row[field+'Id'])?.name??'';
    if(refs===RETURN_REFS){const status=masters.get(row.statusId);result.isClosed=!!status?.isClosed;result.statusTone=status?.tone??'neutral';}
    return result;
  }
  function failMissing(value){if(!value)throw new InputError('Eintrag wurde nicht gefunden.',404);return value;}
  function sqlAction(callback){try{return callback();}catch(error){if(String(error.message).includes('UNIQUE constraint'))throw new InputError('Artikelnummer oder Retourennummer ist bereits vorhanden.',409);throw error;}}
  function save(table,data,id) {
    const now=new Date().toISOString(),values={...data,updatedAt:now};
    if(!id)values.createdAt=now;
    if(table==='products')values.active=Number(values.active);
    const keys=Object.keys(values);
    if(id){sqlAction(()=>db.prepare(`UPDATE ${table} SET ${keys.map(k=>k+'=?').join(',')} WHERE id=?`).run(...Object.values(values),id));return id;}
    return Number(sqlAction(()=>db.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(values))).lastInsertRowid);
  }
  function resolveFields(input,refs,existing) {
    const result={};
    for(const [field,kind]of Object.entries(refs)){
      const key=field+'Id';let value;
      if(Object.hasOwn(input,key)&&input[key]!==undefined){
        value=input[key];
        if(value==='')value=null;else if(typeof value==='string'&&/^\d+$/.test(value))value=Number(value);
        if(value!==null&&(!Number.isSafeInteger(value)||value<1))throw new InputError('Ungültige Auswahl.');
      }else if(Object.hasOwn(input,field))value=input[field];else if(existing)value=existing[key];
      const item=masters.resolve(kind,value,existing?.[key],refs===RETURN_REFS&&field!=='supplier');
      result[key]=item?.id??null;result[field]=item?.name??'';
    }
    return result;
  }
  const joinQuery='SELECT r.*, p.name AS productName, p.sku, p.ean, p.priceCents FROM returns r JOIN products p ON p.id=r.productId';
  const store={
    db, masters,
    listMasterData:()=>masters.all(), createMasterData:(kind,input)=>masters.create(kind,input), updateMasterData:(id,input)=>masters.update(id,input), deleteMasterData:id=>masters.remove(id),
    listProducts:()=>db.prepare('SELECT * FROM products ORDER BY createdAt DESC,id DESC').all().map(r=>display(r,PRODUCT_REFS)),
    getProduct:id=>display(db.prepare('SELECT * FROM products WHERE id=?').get(id),PRODUCT_REFS),
    findProduct:sku=>display(db.prepare('SELECT * FROM products WHERE sku=?').get(sku),PRODUCT_REFS),
    listReturns:()=>db.prepare(`${joinQuery} ORDER BY r.createdAt DESC,r.id DESC`).all().map(r=>display(r,RETURN_REFS)),
    getReturn:id=>display(db.prepare(`${joinQuery} WHERE r.id=?`).get(id),RETURN_REFS),
    findReturn:number=>{const r=db.prepare('SELECT id FROM returns WHERE returnNumber=?').get(number);return r?store.getReturn(r.id):null;},
    prepareProduct(input,id){const old=id?failMissing(store.getProduct(id)):null,refs=resolveFields(input,PRODUCT_REFS,old);return {...validateProduct({...input,...refs}),...refs};},
    prepareReturn(input,id){
      const old=id?failMissing(store.getReturn(id)):null,p=failMissing(store.getProduct(Number(input.productId)));
      if(!p.active&&old?.productId!==p.id)throw new InputError('Archivierte Produkte können keine neuen Retouren erhalten.');
      const values={...input};
      if(!old&&!Object.hasOwn(values,'supplier')&&!Object.hasOwn(values,'supplierId'))values.supplierId=masters.get(p.supplierId)?.active?p.supplierId:null;
      const refs=resolveFields(values,RETURN_REFS,old),choices=Object.fromEntries(Object.entries(masters.all()).map(([k,v])=>[k,v.map(x=>x.name)]));
      return {...validateReturn({...values,...refs},choices),...refs};
    },
    createProduct(input){return store.getProduct(save('products',store.prepareProduct(input)));},
    updateProduct(id,input){return store.getProduct(save('products',store.prepareProduct(input,id),id));},
    deleteProduct(id){
      failMissing(store.getProduct(id));
      if(db.prepare('SELECT id FROM returns WHERE productId=? LIMIT 1').get(id)){db.prepare('UPDATE products SET active=0,updatedAt=? WHERE id=?').run(new Date().toISOString(),id);return {archived:true};}
      db.prepare('DELETE FROM products WHERE id=?').run(id);return {archived:false};
    },
    createReturn(input){return store.transaction(()=>{
      const data=store.prepareReturn(input),now=new Date().toISOString();data.returnNumber=data.returnNumber||null;
      const id=save('returns',data);
      if(!data.returnNumber){let number=`RET-${now.slice(0,4)}-${String(id).padStart(6,'0')}`;while(store.findReturn(number))number+='A';db.prepare('UPDATE returns SET returnNumber=? WHERE id=?').run(number,id);}
      return store.getReturn(id);
    });},
    updateReturn(id,input){const data=store.prepareReturn(input,id);delete data.returnNumber;return store.getReturn(save('returns',data,id));},
    deleteReturn(id){failMissing(store.getReturn(id));db.prepare('DELETE FROM returns WHERE id=?').run(id);return {deleted:true};},
    transaction(callback){const nested=db.isTransaction;if(!nested)db.exec('BEGIN IMMEDIATE');try{const result=callback();if(!nested)db.exec('COMMIT');return result;}catch(error){if(!nested)db.exec('ROLLBACK');throw error;}},
    close:()=>db.close()
  };
  return store;
}
