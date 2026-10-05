import {randomBytes,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {InputError} from '../shared/model.js';

const derive=promisify(scrypt);
function validPassword(value){if(typeof value!=='string'||value.length<12||value.length>256)throw new InputError('Passwort muss zwischen 12 und 256 Zeichen enthalten.');return value;}
async function hashPassword(password){const passwordSalt=randomBytes(32).toString('hex');return {passwordSalt,passwordHash:(await derive(validPassword(password),passwordSalt,64)).toString('hex')};}
export async function verifyPassword(password,credentials){
  if(typeof password!=='string'||password.length>256)return false;
  const actual=await derive(password,credentials.passwordSalt,64),expected=Buffer.from(credentials.passwordHash,'hex');
  return actual.length===expected.length&&timingSafeEqual(actual,expected);
}
function profile(row){return row?{id:row.id,username:row.username,displayName:row.displayName,role:row.role,active:!!row.active,createdAt:row.createdAt,updatedAt:row.updatedAt}:null;}
function fields(input){
  if(typeof input.username!=='string'||! /^[a-zA-Z0-9._-]{3,64}$/.test(input.username.trim()))throw new InputError('Benutzername: 3–64 Zeichen aus Buchstaben, Ziffern, Punkt, Bindestrich oder Unterstrich.');
  if(typeof(input.displayName??'')!=='string'||(input.displayName??'').length>100)throw new InputError('Anzeigename: maximal 100 Zeichen.');
  const role=input.role??'member',active=input.active??true;if(!['admin','member'].includes(role))throw new InputError('Ungültige Rolle.');if(typeof active!=='boolean')throw new InputError('Ungültiger Aktivstatus.');
  const username=input.username.trim();return {username,usernameKey:username.toLowerCase(),displayName:(input.displayName??'').trim()||username,role,active};
}
export function createUsers(store){
  const db=store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,username TEXT NOT NULL,usernameKey TEXT NOT NULL UNIQUE,displayName TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin','member')),active INTEGER NOT NULL DEFAULT 1,
    passwordHash TEXT NOT NULL,passwordSalt TEXT NOT NULL,authVersion INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,updatedAt TEXT NOT NULL);`);
  const credentialsById=id=>db.prepare('SELECT * FROM users WHERE id=?').get(id)??null;
  const setupRequired=()=>db.prepare('SELECT COUNT(*) AS total FROM users').get().total===0;
  function transaction(callback){try{return store.transaction(callback);}catch(error){if(String(error.message).includes('UNIQUE constraint'))throw new InputError('Dieser Benutzername ist bereits vergeben.',409);throw error;}}
  function missing(id){const old=credentialsById(id);if(!old)throw new InputError('Konto nicht gefunden.',404);return old;}
  async function create(input,first=false,beforeCommit=()=>{}){
    const value=fields(first?{...input,role:'admin',active:true}:input),hash=await hashPassword(input.password);
    return transaction(()=>{
      beforeCommit();
      if(first&&!setupRequired())throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.',409);
      if(!first&&setupRequired())throw new InputError('Bitte zuerst den Administrator einrichten.');
      const now=new Date().toISOString();
      const r=db.prepare('INSERT INTO users(username,usernameKey,displayName,role,active,passwordHash,passwordSalt,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?,?)').run(value.username,value.usernameKey,value.displayName,value.role,Number(value.active),hash.passwordHash,hash.passwordSalt,now,now);
      return profile(credentialsById(Number(r.lastInsertRowid)));
    });
  }
  return {
    setupRequired,credentialsById,
    credentialsByName:name=>typeof name==='string'?db.prepare('SELECT * FROM users WHERE usernameKey=?').get(name.trim().toLowerCase())??null:null,
    get:id=>profile(credentialsById(id)),list:()=>db.prepare('SELECT * FROM users ORDER BY active DESC,usernameKey,id').all().map(profile),
    createFirst:input=>create(input,true),create:(input,beforeCommit)=>create(input,false,beforeCommit),
    async update(id,input,beforeCommit=()=>{}){
      missing(id);const hash=Object.hasOwn(input,'password')?await hashPassword(input.password):null;
      return transaction(()=>{
        beforeCommit();
        const old=missing(id),value=fields({...old,active:!!old.active,...input});
        if(old.active&&old.role==='admin'&&(!value.active||value.role!=='admin')&&db.prepare("SELECT COUNT(*) AS total FROM users WHERE active=1 AND role='admin'").get().total<=1)throw new InputError('Mindestens ein aktiver Administrator muss erhalten bleiben.');
        const version=old.authVersion+Number(!!hash||!!old.active!==value.active);
        db.prepare('UPDATE users SET username=?,usernameKey=?,displayName=?,role=?,active=?,passwordHash=?,passwordSalt=?,authVersion=?,updatedAt=? WHERE id=?').run(value.username,value.usernameKey,value.displayName,value.role,Number(value.active),hash?.passwordHash??old.passwordHash,hash?.passwordSalt??old.passwordSalt,version,new Date().toISOString(),id);
        return profile(credentialsById(id));
      });
    },
    async changePassword(id,currentPassword,newPassword,beforeCommit=()=>{}){
      const old=missing(id);if(!old.active||!await verifyPassword(currentPassword,old))throw new InputError('Das aktuelle Passwort ist nicht korrekt.',401);
      const hash=await hashPassword(newPassword);
      transaction(()=>{
        beforeCommit();
        const current=missing(id);if(!current.active||current.authVersion!==old.authVersion)throw new InputError('Kontozugang wurde geändert. Bitte erneut anmelden.',401);
        db.prepare('UPDATE users SET passwordHash=?,passwordSalt=?,authVersion=authVersion+1,updatedAt=? WHERE id=?').run(hash.passwordHash,hash.passwordSalt,new Date().toISOString(),id);
      });
    }
  };
}
