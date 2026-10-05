import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import {readFileSync,readdirSync} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createAuth } from './auth.js';
import {createUsers} from './users.js';
import { previewImport, commitImport } from './import.js';
import { InputError, PRODUCT_COLUMNS, RETURN_COLUMNS } from '../shared/model.js';
import { exportCsv } from '../shared/csv.js';
import {createAttachments} from './attachments.js';

const root = new URL('../',import.meta.url);
const {version} = JSON.parse(readFileSync(new URL('package.json',root),'utf8'));
const files = new Map([
  ['/', ['public/index.html','text/html']], ['/index.html',['public/index.html','text/html']],
  ['/styles.css',['public/styles.css','text/css']], ['/app.js',['public/app.js','text/javascript']],
  ['/theme.js',['public/theme.js','text/javascript']], ['/theme.css',['public/theme.css','text/css']],
  ['/forms.js',['public/forms.js','text/javascript']], ['/import.js',['public/import.js','text/javascript']],
  ['/admin.js',['public/admin.js','text/javascript']],
  ['/accounts.js',['public/accounts.js','text/javascript']],
  ['/attachments.js',['public/attachments.js','text/javascript']],
  ['/pdf-preview.js',['public/pdf-preview.js','text/javascript']],
  ['/shared/model.js',['shared/model.js','text/javascript']], ['/shared/csv.js',['shared/csv.js','text/javascript']],
  ['/shared/import-session.js',['shared/import-session.js','text/javascript']],
  ['/favicon.svg',['public/favicon.svg','image/svg+xml']]
]);
for(const name of ['pdf.min.mjs','pdf.worker.min.mjs'])files.set('/vendor/pdfjs/'+name,['public/vendor/pdfjs/'+name,'text/javascript']);
for(const folder of ['cmaps','standard_fonts','wasm'])for(const name of readdirSync(new URL(`../public/vendor/pdfjs/${folder}/`,import.meta.url))){
  if(!/^[\w.-]+\.(bcmap|pfb|ttf|wasm|js)$/.test(name))continue;
  const type=name.endsWith('.wasm')?'application/wasm':name.endsWith('.js')?'text/javascript':'application/octet-stream';
  files.set(`/vendor/pdfjs/${folder}/${name}`,[`public/vendor/pdfjs/${folder}/${name}`,type]);
}
async function jsonBody(req) {
  if (!String(req.headers['content-type'] ?? '').startsWith('application/json')) throw new InputError('JSON-Daten erwartet.',415);
  let size = 0; const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 3_000_000) throw new InputError('Anfrage ist zu groß.',413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch { throw new InputError('Ungültige JSON-Daten.'); }
}
export function createApp({dbPath, secureCookies = false, publicOrigin = ''}) {
  const store = createStore(dbPath),users=createUsers(store),auth=createAuth({users});
  const attachments=createAttachments(store,dbPath);
  const configuredOrigin = publicOrigin ? new URL(publicOrigin).origin : '';
  const cookieName = secureCookies ? '__Host-retouren_session' : 'retouren_session';
  const cookie = (token,maxAge) => `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secureCookies ? '; Secure' : ''}`;
  const server = createServer(async (req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; worker-src 'self'; font-src 'self' data: blob:; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if (secureCookies) res.setHeader('Strict-Transport-Security','max-age=31536000');
    function json(value,status = 200) {
      res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});
      res.end(JSON.stringify(value));
    }
    try {
      const path = new URL(req.url,'http://localhost').pathname;
      const method = req.method;
      if (path === '/health' && method === 'GET') return json({ok:true});
      if (!path.startsWith('/api/')) {
        const asset = files.get(path);
        if (!asset || !['GET','HEAD'].includes(method)) throw new InputError('Seite nicht gefunden.',404);
        const content = await readFile(fileURLToPath(new URL(asset[0],root)));
        res.writeHead(200,{'Content-Type':`${asset[1]}; charset=utf-8`,'Cache-Control':'no-cache'});
        return res.end(method === 'HEAD' ? undefined : content);
      }
      const token = String(req.headers.cookie ?? '').split(';').map(c => c.trim()).find(c => c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      const session = auth.getSession(token);
      function sessionBody(value){return {unlocked:!!value,csrfToken:value?.csrfToken??null,expiresAt:value?.expiresAt??null,user:value?.user??null,setupRequired:users.setupRequired(),version};}
      function requireSession(){const current=auth.getSession(token);if(!current)throw new InputError('Bitte zuerst anmelden.',401);return current;}
      function requireAdmin(){const current=auth.getSession(token);if(!current)throw new InputError('Bitte zuerst anmelden.',401);if(current.user.role!=='admin')throw new InputError('Diese Funktion ist nur für Administratoren verfügbar.',403);return current;}
      if (method === 'GET' && path === '/api/session') return json(sessionBody(session));
      if(!['/api/login','/api/setup'].includes(path))requireSession();
      async function body(){const value=await jsonBody(req);if(!['/api/login','/api/setup'].includes(path)){requireSession();if(path.startsWith('/api/users')||path.startsWith('/api/masterdata/'))requireAdmin();}return value;}
      const isWrite = !['GET','HEAD'].includes(method);
      if (isWrite) {
        if (!['/api/login','/api/setup'].includes(path) && !session) throw new InputError('Bitte zuerst anmelden.',401);
        const expectedOrigin = configuredOrigin || `${secureCookies ? 'https' : 'http'}://${req.headers.host}`;
        if (req.headers.origin !== expectedOrigin) throw new InputError('Diese Anfrage ist nicht erlaubt.',403);
        if (!['/api/login','/api/setup'].includes(path) && req.headers['x-csrf-token'] !== session.csrfToken) throw new InputError('Sitzung ungültig. Bitte erneut anmelden.',403);
      }
      if(method==='POST'&&path==='/api/setup'){
        if(!users.setupRequired())throw new InputError('Die Ersteinrichtung ist bereits abgeschlossen.',409);
        const account=await users.createFirst(await jsonBody(req)),login=auth.startSession(account.id);
        res.setHeader('Set-Cookie',cookie(login.token,8*60*60));return json(sessionBody(login),201);
      }
      if (method === 'POST' && path === '/api/login') {
        const body = await jsonBody(req);
        const login = await auth.login(body,req.socket.remoteAddress);
        res.setHeader('Set-Cookie',cookie(login.token,8*60*60));
        return json(sessionBody(login));
      }
      if (method === 'POST' && path === '/api/logout') {
        auth.logout(token); res.setHeader('Set-Cookie',cookie('',0)); return json(sessionBody(null));
      }
      if(path==='/api/users'){
        requireAdmin();if(method==='GET')return json(users.list());
        if(method==='POST'){const value=await body();return json(await users.create(value,requireAdmin),201);}
      }
      const userPath=path.match(/^\/api\/users\/([1-9]\d*)$/);
      if(userPath){requireAdmin();const id=Number(userPath[1]);if(!Number.isSafeInteger(id))throw new InputError('Ungültige ID.');if(method==='PUT'){const value=await body();return json(await users.update(id,value,requireAdmin));}}
      if(method==='POST'&&path==='/api/account/password'){
        const value=await body(),current=requireSession();
        await users.changePassword(current.user.id,value.currentPassword,value.newPassword,requireSession);auth.logout(token);res.setHeader('Set-Cookie',cookie('',0));return json(sessionBody(null));
      }
      const attachmentList=path.match(/^\/api\/returns\/([1-9]\d*)\/attachments$/);
      if(attachmentList){
        const id=Number(attachmentList[1]);if(!Number.isSafeInteger(id))throw new InputError('Ungültige ID.');
        if(method==='GET')return json(attachments.list(id));
        if(method==='POST')return json(await attachments.upload(id,req,requireSession),201);
      }
      const attachmentPath=path.match(/^\/api\/attachments\/([1-9]\d*)(?:\/(preview|download))?$/);
      if(attachmentPath){
        const id=Number(attachmentPath[1]);if(!Number.isSafeInteger(id))throw new InputError('Ungültige ID.');
        if(method==='DELETE'&&!attachmentPath[2])return json(attachments.remove(id));
        if(['GET','HEAD'].includes(method)&&attachmentPath[2]){
          const {item,bytes}=await attachments.read(id),mode=attachmentPath[2]==='download'?'attachment':'inline';
          requireSession();
          res.setHeader('X-Frame-Options','SAMEORIGIN');
          res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'self'; base-uri 'none'");
          res.writeHead(200,{'Content-Type':item.mediaType,'Content-Length':item.size,'Cache-Control':'no-store','Content-Disposition':`${mode}; filename="datei${item.mediaType==='application/pdf'?'.pdf':item.mediaType==='image/png'?'.png':item.mediaType==='image/webp'?'.webp':'.jpg'}"; filename*=UTF-8''${encodeURIComponent(item.originalName)}`});
          return res.end(method==='HEAD'?undefined:bytes);
        }
      }
      if(method==='GET'&&path==='/api/masterdata'){
        const values=store.listMasterData();
        if(session?.user.role!=='admin')for(const entries of Object.values(values))for(const item of entries){delete item.code;delete item.notes;delete item.nameKey;}
        return json(values);
      }
      const masterMatch=path.match(/^\/api\/masterdata\/([a-z]+|[1-9]\d*)$/);
      if(masterMatch){
        if(isWrite)requireAdmin();
        const key=masterMatch[1];
        if(method==='POST'&&/^[a-z]+$/.test(key))return json(store.createMasterData(key,await body()),201);
        if(/^\d+$/.test(key)){
          const id=Number(key);if(!Number.isSafeInteger(id))throw new InputError('Ungültige ID.');
          if(method==='PUT')return json(store.updateMasterData(id,await body()));
          if(method==='DELETE')return json(store.deleteMasterData(id));
        }
      }
      for (const kind of ['products','returns']) {
        if (path === `/api/${kind}`) {
          if (method === 'GET') return json(kind === 'products' ? store.listProducts() : store.listReturns());
          if (method === 'POST') return json(kind === 'products' ? store.createProduct(await body()) : store.createReturn(await body()),201);
        }
        const match = path.match(new RegExp(`^/api/${kind}/([1-9]\\d*)$`));
        if (match) {
          const id = Number(match[1]);
          if (!Number.isSafeInteger(id)) throw new InputError('Ungültige ID.');
          if (method === 'GET') {
            const item = kind === 'products' ? store.getProduct(id) : store.getReturn(id);
            if (!item) throw new InputError('Eintrag nicht gefunden.',404);
            return json(item);
          }
          if (method === 'PUT') return json(kind === 'products' ? store.updateProduct(id,await body()) : store.updateReturn(id,await body()));
          if (method === 'DELETE') return json(kind === 'products' ? store.deleteProduct(id) : attachments.removeReturn(id));
        }
        if (method === 'GET' && [ `/api/export/${kind}`, `/api/template/${kind}` ].includes(path)) {
          const columns = kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS;
          const data = path.includes('/template/') ? [] : (kind === 'products' ? store.listProducts() : store.listReturns());
          const rows = data.map(item => Object.keys(columns).map(key => key === 'price' ? (item.priceCents/100).toFixed(2).replace('.',',') : key === 'active' ? (item.active ? 'ja' : 'nein') : item[key]));
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':`attachment; filename="${kind === 'products' ? 'produkte' : 'retouren'}${path.includes('/template/') ? '-vorlage' : ''}.csv"`,'Cache-Control':'no-store'});
          return res.end(exportCsv(Object.values(columns),rows));
        }
      }
      if (method === 'POST' && ['/api/import/preview','/api/import/commit'].includes(path)) {
        const b = await body();
        const operation = path.endsWith('preview') ? previewImport : commitImport;
        return json(operation(store,b.kind,b.text,b.mapping,b.updateExisting ?? false));
      }
      throw new InputError('Endpunkt nicht gefunden.',404);
    } catch (error) {
      if (error.status === 429) res.setHeader('Retry-After','900');
      if (!(error instanceof InputError)) console.error('Serverfehler:',error);
      if (!res.headersSent) json({error:error instanceof InputError ? error.message : 'Ein Serverfehler ist aufgetreten.'},error.status ?? 500);
      else res.end();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  return {server,store,users,close:() => new Promise(resolve => {
    server.close(() => {store.close();attachments.dispose();resolve();}); server.closeIdleConnections();
  })};
}
