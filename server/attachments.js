import {mkdirSync,mkdtempSync,renameSync,unlinkSync,rmSync} from 'node:fs';
import {open,readFile} from 'node:fs/promises';
import {dirname,join,extname} from 'node:path';
import {tmpdir} from 'node:os';
import {randomUUID} from 'node:crypto';
import {InputError} from '../shared/model.js';

export const MAX_FILE_SIZE=10*1024*1024;
const formats={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};
function fileName(header){
  let name;try{name=decodeURIComponent(header??'');}catch{throw new InputError('Ungültiger Dateiname.');}
  if(!name||name.length>250||/[\x00-\x1f\x7f/\\]/.test(name)||name==='.'||name==='..')throw new InputError('Ungültiger Dateiname.');
  if(!Object.hasOwn(formats,extname(name).toLowerCase()))throw new InputError('Erlaubt sind PDF, PNG, JPG/JPEG und WebP.');
  return name;
}
function detect(bytes){
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes.length>=3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.subarray(0,5).toString('ascii')==='%PDF-')return 'application/pdf';
  if(bytes.length>=12&&bytes.subarray(0,4).toString('ascii')==='RIFF'&&bytes.subarray(8,12).toString('ascii')==='WEBP')return 'image/webp';
  throw new InputError('Dateiinhalt wird nicht unterstützt. Bitte PDF, PNG, JPG/JPEG oder WebP auswählen.');
}
export function createAttachments(store,dbPath){
  const db=store.db,memory=dbPath===':memory:';
  const folder=memory?mkdtempSync(join(tmpdir(),'retouren-attachments-')):join(dirname(dbPath),'attachments');
  db.exec(`CREATE TABLE IF NOT EXISTS attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,returnId INTEGER NOT NULL REFERENCES returns(id) ON DELETE CASCADE,
    originalName TEXT NOT NULL,storedName TEXT NOT NULL UNIQUE,mediaType TEXT NOT NULL,size INTEGER NOT NULL,createdAt TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS attachments_return ON attachments(returnId);`);
  const publicItem=({storedName,...item})=>item;
  function ensureReturn(id){if(!store.getReturn(id))throw new InputError('Retoure nicht gefunden.',404);}
  const list=returnId=>{ensureReturn(returnId);return db.prepare('SELECT * FROM attachments WHERE returnId=? ORDER BY id').all(returnId).map(publicItem);};
  function get(id){const item=db.prepare('SELECT * FROM attachments WHERE id=?').get(id);if(!item)throw new InputError('Datei nicht gefunden.',404);return item;}
  function deleteFile(name){try{unlinkSync(join(folder,name));}catch(error){if(error.code!=='ENOENT')throw error;}}
  return {
    list,
    async upload(returnId,req,beforeCommit=()=>{}){
      ensureReturn(returnId);if(list(returnId).length>=10)throw new InputError('Pro Retoure sind maximal 10 Dateien erlaubt.');
      const originalName=fileName(req.headers['x-file-name']);
      if(Number(req.headers['content-length'])>MAX_FILE_SIZE)throw new InputError('Datei ist zu groß. Maximal 10 MB sind erlaubt.',413);
      mkdirSync(folder,{recursive:true});const storedName=randomUUID()+extname(originalName).toLowerCase(),tempName=storedName+'.part',path=join(folder,tempName);
      let handle,size=0,head=Buffer.alloc(0),moved=false;
      try{
        handle=await open(path,'wx');
        for await(const chunk of req){
          size+=chunk.length;if(size>MAX_FILE_SIZE)throw new InputError('Datei ist zu groß. Maximal 10 MB sind erlaubt.',413);
          if(head.length<16)head=Buffer.concat([head,chunk.subarray(0,16-head.length)]);
          await handle.write(chunk);
        }
        await handle.close();handle=null;
        const mediaType=detect(head);if(mediaType!==formats[extname(originalName).toLowerCase()])throw new InputError('Dateiendung und Dateiinhalt stimmen nicht überein.');
        return store.transaction(()=>{
          beforeCommit();
          ensureReturn(returnId);if(list(returnId).length>=10)throw new InputError('Pro Retoure sind maximal 10 Dateien erlaubt.');
          renameSync(path,join(folder,storedName));moved=true;
          const result=db.prepare('INSERT INTO attachments(returnId,originalName,storedName,mediaType,size,createdAt) VALUES(?,?,?,?,?,?)').run(returnId,originalName,storedName,mediaType,size,new Date().toISOString());
          return publicItem(get(Number(result.lastInsertRowid)));
        });
      }catch(error){if(handle)await handle.close();deleteFile(tempName);if(moved)deleteFile(storedName);throw error;}
    },
    async read(id){const item=get(id);try{return {item:publicItem(item),bytes:await readFile(join(folder,item.storedName))};}catch(error){if(error.code==='ENOENT')throw new InputError('Datei fehlt im Datenspeicher.',404);throw error;}},
    remove(id){const item=get(id);deleteFile(item.storedName);db.prepare('DELETE FROM attachments WHERE id=?').run(id);return {deleted:true};},
    removeReturn(id){ensureReturn(id);for(const item of db.prepare('SELECT storedName FROM attachments WHERE returnId=?').all(id))deleteFile(item.storedName);return store.deleteReturn(id);},
    dispose(){if(memory)rmSync(folder,{recursive:true,force:true});}
  };
}
