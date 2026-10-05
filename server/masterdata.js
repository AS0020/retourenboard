import {InputError, MASTER_KINDS, PRODUCT_REFS, RETURN_REFS} from '../shared/model.js';
import {nameKey} from './migrate.js';

const requiredKinds = new Set(['reasons','conditions','statuses','resolutions']);
export function createMasterDataRepository(db) {
  const normalize = r => r ? {...r,active:!!r.active,isDefault:!!r.isDefault,isClosed:!!r.isClosed} : null;
  const get = id => normalize(db.prepare('SELECT * FROM masterdata WHERE id=?').get(id));
  function checkKind(kind) {if (!Object.hasOwn(MASTER_KINDS,kind)) throw new InputError('Unbekannte Stammdatenliste.');}
  function list(kind) {checkKind(kind);return db.prepare('SELECT * FROM masterdata WHERE kind=? ORDER BY active DESC, name COLLATE NOCASE, id').all(kind).map(normalize);}
  function transaction(callback) {
    const nested=db.isTransaction;if (!nested)db.exec('BEGIN IMMEDIATE');
    try {const result=callback();if(!nested)db.exec('COMMIT');return result;}
    catch(error){if(!nested)db.exec('ROLLBACK');if(String(error.message).includes('UNIQUE constraint'))throw new InputError('Dieser Name existiert in der Liste bereits.',409);throw error;}
  }
  function validate(kind,input) {
    const result={};
    for (const [key,max] of [['name',250],['code',100],['notes',2000]]) {
      if (typeof(input[key]??'')!=='string'||(input[key]??'').length>max)throw new InputError(`Ungültiger Wert für ${key}.`);
      result[key]=(input[key]??'').trim();
    }
    if(!result.name)throw new InputError('Name ist erforderlich.');
    for(const key of ['active','isDefault','isClosed']){result[key]=input[key]??(key==='active');if(typeof result[key]!=='boolean')throw new InputError(`Ungültiger Wert für ${key}.`);}
    result.isDefault=requiredKinds.has(kind)&&result.isDefault;result.isClosed=kind==='statuses'&&result.isClosed;
    result.tone=input.tone??'received';if(!['received','checking','working','done','neutral'].includes(result.tone))throw new InputError('Ungültige Statusfarbe.');
    if(!result.active&&result.isDefault)throw new InputError('Ein archivierter Wert kann kein Standard sein.');
    return result;
  }
  function ensureDefault(kind) {
    if(!requiredKinds.has(kind))return;
    const values=list(kind).filter(x=>x.active);if(!values.length)throw new InputError('Mindestens ein aktiver Wert muss erhalten bleiben.');
    if(!values.some(x=>x.isDefault))db.prepare('UPDATE masterdata SET isDefault=1 WHERE id=?').run(values[0].id);
  }
  function used(id) {
    for(const [table,refs]of [['products',PRODUCT_REFS],['returns',RETURN_REFS]])for(const field of Object.keys(refs))if(db.prepare(`SELECT id FROM ${table} WHERE ${field}Id=? LIMIT 1`).get(id))return true;
    return false;
  }
  return {
    get, list, all:()=>Object.fromEntries(Object.keys(MASTER_KINDS).map(k=>[k,list(k)])),
    create(kind,input){checkKind(kind);return transaction(()=>{
      const v=validate(kind,input),now=new Date().toISOString();if(v.isDefault)db.prepare('UPDATE masterdata SET isDefault=0 WHERE kind=?').run(kind);
      const r=db.prepare('INSERT INTO masterdata(kind,name,nameKey,code,notes,active,isDefault,isClosed,tone,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(kind,v.name,nameKey(v.name),v.code,v.notes,Number(v.active),Number(v.isDefault),Number(v.isClosed),v.tone,now,now);
      ensureDefault(kind);return get(Number(r.lastInsertRowid));
    });},
    update(id,input){const old=get(id);if(!old)throw new InputError('Stammdateneintrag nicht gefunden.',404);return transaction(()=>{
      const v=validate(old.kind,{...old,...input});if(v.isDefault)db.prepare('UPDATE masterdata SET isDefault=0 WHERE kind=?').run(old.kind);
      db.prepare('UPDATE masterdata SET name=?,nameKey=?,code=?,notes=?,active=?,isDefault=?,isClosed=?,tone=?,updatedAt=? WHERE id=?').run(v.name,nameKey(v.name),v.code,v.notes,Number(v.active),Number(v.isDefault),Number(v.isClosed),v.tone,new Date().toISOString(),id);
      ensureDefault(old.kind);return get(id);
    });},
    remove(id){const old=get(id);if(!old)throw new InputError('Stammdateneintrag nicht gefunden.',404);return transaction(()=>{
      const archived=used(id);
      if(archived)db.prepare('UPDATE masterdata SET active=0,isDefault=0,updatedAt=? WHERE id=?').run(new Date().toISOString(),id);else db.prepare('DELETE FROM masterdata WHERE id=?').run(id);
      ensureDefault(old.kind);return {archived};
    });},
    resolve(kind,value,existingId=null,required=false){
      checkKind(kind);
      if(value===undefined&&required)return list(kind).find(x=>x.active&&x.isDefault);
      if(value===null||value===''||value===undefined){if(required)throw new InputError('Bitte einen Wert auswählen.');return null;}
      let item;
      if(typeof value==='number'&&Number.isSafeInteger(value)&&value>0)item=get(value);
      else if(typeof value==='string')item=normalize(db.prepare('SELECT * FROM masterdata WHERE kind=? AND nameKey=?').get(kind,nameKey(value)));
      if(!item||item.kind!==kind)throw new InputError(`${MASTER_KINDS[kind]}: Wert ist unbekannt. Bitte zuerst im Adminbereich anlegen.`);
      if(!item.active&&item.id!==existingId)throw new InputError('Archivierte Werte können nicht neu zugeordnet werden.');
      return item;
    }
  };
}
