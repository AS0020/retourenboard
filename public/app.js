import { h, icon, openDialog, productForm, returnForm, showDetails } from './forms.js';
import { openImport, openExport } from './import.js';
import {renderAdmin,bindAdmin} from './admin.js';
import {openLogin,openAccount} from './accounts.js';

const labels={overview:'Übersicht',returns:'Retouren',products:'Produkte',admin:'Adminbereich'};
const state={products:[],returns:[],masterdata:{},session:{unlocked:false},view:'overview',search:'',status:'',category:'',activity:'active'};
const currency=value=>(value/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'});
const date=value=>value?new Date(value+'T12:00:00').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',year:'numeric'}):'—';
const statuses=()=>[...(state.masterdata.statuses??[])].filter(s=>s.active||state.returns.some(r=>r.statusId===s.id)).sort((a,b)=>a.id-b.id);
const statusClass=value=>state.masterdata.statuses?.find(s=>s.name===value)?.tone||'neutral';
const badge=value=>`<span class="status ${statusClass(value)}"><span></span>${h(value)}</span>`;
const avatar=name=>`<span class="product-avatar">${h(name.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase())}</span>`;
const ctx={
  get products(){return state.products;},
  get masterdata(){return state.masterdata;},
  get unlocked(){return state.session.unlocked;},
  get session(){return state.session;},
  get isAdmin(){return state.session.user?.role==='admin';},
  applySession(session){state.session=session;if(!session.unlocked){state.products=[];state.returns=[];state.masterdata={};}updateAccess();if(!session.unlocked)render();},
  get csrfToken(){return state.session.csrfToken;},
  async api(path,options={}) {
    const response=await fetch(path,{method:options.method || 'GET',headers:{'Content-Type':options.file?'application/octet-stream':'application/json',...(options.file?{'X-File-Name':encodeURIComponent(options.file.name)}:{}),...(state.session.csrfToken?{'X-CSRF-Token':state.session.csrfToken}:{})},...(options.file?{body:options.file}:options.body!==undefined?{body:JSON.stringify(options.body)}:{})});
    const data=await response.json();
    if(!response.ok){if(response.status===401){
      const sessionResponse=await fetch('/api/session');ctx.applySession(await sessionResponse.json());
      if(!ctx.unlocked&&document.querySelector('#dialog').open){document.querySelector('#dialog').close();loginDialog();}
    }throw new Error(data.error || 'Anfrage fehlgeschlagen.');}
    return data;
  },
  async reload() {
    ctx.applySession(await ctx.api('/api/session'));
    if(!ctx.unlocked){render();return;}
    const [products,returns,masterdata]=await Promise.all([ctx.api('/api/products'),ctx.api('/api/returns'),ctx.api('/api/masterdata')]);
    if(!ctx.unlocked)return;
    state.products=products;state.returns=returns;state.masterdata=masterdata;
    updateAccess();render();
    document.querySelector('#sync-time').textContent=`Aktualisiert ${new Date().toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})}`;
  },
  toast(message) {
    const region=document.querySelector('#toast-region');region.textContent=message;region.classList.add('visible');
    clearTimeout(ctx.toastTimer);ctx.toastTimer=setTimeout(()=>region.classList.remove('visible'),4500);
  },
  async ensureUnlocked(action) {
    try {ctx.applySession(await ctx.api('/api/session'));if(state.session.unlocked)return action();loginDialog(action);}
    catch(error){ctx.toast(error.message);}
  }
};
function updateAccess(){
  const unlocked=state.session.unlocked;
  document.querySelector('#app-version').textContent=state.session.version?`Version ${state.session.version}`:'';
  document.body.classList.toggle('auth-screen',!unlocked);
  const name=state.session.user?.displayName;
  document.querySelector('#header-access').innerHTML=`${icon(unlocked?'unlock':'lock')}<span>${unlocked?h(name):state.session.setupRequired?'Ersteinrichtung':'Anmelden'}</span>`;
  document.querySelector('#header-access').classList.toggle('unlocked',unlocked);
  document.querySelector('#access-button').innerHTML=`${icon(unlocked?'unlock':'lock')}<span><strong>${unlocked?h(name):'Anmeldung erforderlich'}</strong><small>${unlocked?(ctx.isAdmin?'Administrator':'Mitarbeiter')+' · Mein Konto':state.session.setupRequired?'Ersten Administrator anlegen':'Mit persönlichem Konto anmelden'}</small></span>${icon('chevron')}`;
  document.querySelector('#nav-count').textContent=state.returns.filter(r=>!r.isClosed).length;document.querySelector('#nav-count').hidden=!unlocked;
}
function loginDialog(after=()=>{}){
  openLogin(ctx,after);
}
async function accessClick(){
  try{ctx.applySession(await ctx.api('/api/session'));if(ctx.unlocked)openAccount(ctx);else loginDialog();}catch(error){ctx.toast(error.message);}
}
const createButton=(kind,label)=>`<button class="btn primary" data-create="${kind}">${icon('plus')}${label}</button>`;
function render(){
  document.title=`${labels[state.view]} · retourenboard.`;
  document.querySelector('#breadcrumb-current').textContent=labels[state.view];
  document.querySelectorAll('[data-nav]').forEach(el=>{el.classList.toggle('active',el.dataset.nav===state.view);if(el.dataset.nav===state.view)el.setAttribute('aria-current','page');else el.removeAttribute('aria-current');});
  if(!ctx.unlocked){
    document.title=`${state.session.setupRequired?'Ersteinrichtung':'Anmelden'} · retourenboard.`;
    document.querySelector('#content').replaceChildren();
    const dialog=document.querySelector('#dialog');if(dialog.open)dialog.close();
    const page=document.querySelector('#auth-page');
    if(!page.querySelector('#login-form')||page.dataset.stage!==(state.session.setupRequired?'setup':'login'))loginDialog();
    return;
  }
  document.querySelector('#content').innerHTML=state.view==='overview'?overview():state.view==='admin'?renderAdmin(ctx):listPage();
  bindContent();
}
function overview(){
  const open=state.returns.filter(r=>!r.isClosed),checking=state.returns.filter(r=>r.statusTone==='checking'),done=state.returns.filter(r=>r.isClosed),active=state.products.filter(p=>p.active);
  const cards=[['Offene Retouren',open.length,'clock','Warten auf den nächsten Schritt','orange'],['In Prüfung',checking.length,'search','Qualität & Zustand prüfen','blue'],['Abgeschlossen',done.length,'check','Erfolgreich bearbeitet','green'],['Aktive Produkte',active.length,'box','Im gemeinsamen Bestand','neutral']];
  return `<div class="page-heading"><div><div class="eyebrow">DEIN RETOUREN-ARBEITSPLATZ</div><h1>Alles im Blick<span class="heading-dot">.</span></h1><p>Produkte verwalten. Rückläufer erfassen. Gemeinsam weiterkommen.</p></div><div class="heading-actions">${createButton('returns','Neue Retoure')}</div></div>
  <div class="kpi-grid">${cards.map(([label,num,ic,desc,color])=>`<article class="kpi"><div class="kpi-top"><span>${label}</span><span class="kpi-icon ${color}">${icon(ic)}</span></div><strong>${num}</strong><small>${desc}</small></article>`).join('')}</div>
  ${!state.products.length?`<section class="onboarding"><div class="onboarding-art">${icon('box')}<span>${icon('check')}</span></div><div><span class="eyebrow">DEIN ERSTER SCHRITT</span><h2>Ein guter Überblick beginnt mit einem Produkt.</h2><p>Lege deinen Bestand an oder importiere bestehende Produktdaten als CSV.</p></div><div class="onboarding-buttons">${createButton('products','Produkt anlegen')}<button class="btn secondary" data-import="products">${icon('upload')}CSV importieren</button></div></section>`:''}
  <div class="dashboard-grid"><section class="panel recent-panel"><div class="panel-heading"><div><h2>Aktuelle Retouren <span class="count-pill">${state.returns.length}</span></h2><p>Die zuletzt erfassten Rückläufer.</p></div><a class="text-link" href="#returns">Alle ansehen ${icon('arrow')}</a></div>${returnTable(state.returns.slice(0,5),true)}</section>
  <section class="panel workflow"><div class="panel-heading"><div><span class="eyebrow">VOM EINGANG ZUM ABSCHLUSS</span><h2>Dein Retourenprozess</h2></div></div><div class="workflow-steps">${statuses().map(({name:status},index)=>{const count=state.returns.filter(r=>r.status===status).length;return `<div class="workflow-step ${statusClass(status)}"><span class="step-number">0${index+1}</span><div><div class="step-caption"><span>${h(status)}</span><strong>${count}</strong></div><progress value="${count}" max="${Math.max(state.returns.length,1)}" aria-label="${h(status)}: ${count}"></progress></div></div>`;}).join('')}</div><div class="workflow-footer"><span>Warenwert offener Retouren</span><strong>${currency(open.reduce((sum,r)=>sum+r.quantity*r.priceCents,0))}</strong><small>Auf Basis der hinterlegten Verkaufspreise</small></div></section></div>
  <section class="bottom-note">${icon('info')}<span>Ein gemeinsamer Bestand für alle. Zum Bearbeiten meldest du dich mit deinem persönlichen Konto an.</span><button class="text-link" data-unlock>${state.session.unlocked?'Mein Konto':'Anmelden'} ${icon('arrow')}</button></section>`;
}
function listPage(){
  const products=state.view==='products',kind=state.view;
  const categories=[...new Set(state.products.map(p=>p.category).filter(Boolean))].sort();
  return `<div class="page-heading"><div><div class="eyebrow">GEMEINSAMER BESTAND</div><h1>${labels[kind]}<span class="heading-dot">.</span></h1><p>${products?'Alle Produktdaten an einem Ort – von der EAN bis zum Lieferanten.':'Jeder Rückläufer mit Seriennummer, Grund und Bearbeitungsstatus.'}</p></div><div class="heading-actions"><button class="btn secondary" data-import="${kind}">${icon('upload')}CSV importieren</button>${createButton(kind,products?'Neues Produkt':'Neue Retoure')}</div></div>
  ${!products?`<div class="status-tabs" role="group" aria-label="Retourenstatus filtern"><button data-status="" class="${!state.status?'selected':''}">Alle Retouren <span>${state.returns.length}</span></button>${statuses().map(({name:s})=>`<button data-status="${h(s)}" class="${state.status===s?'selected':''}">${h(s)}<span>${state.returns.filter(r=>r.status===s).length}</span></button>`).join('')}</div>`:''}
  <section class="panel list-panel"><div class="table-toolbar"><label class="search-field">${icon('search')}<input id="search" type="search" placeholder="${products?'Produkt, EAN oder Lieferant suchen …':'Retoure, Serien- oder Bestellnummer suchen …'}" aria-label="${products?'Produkte':'Retouren'} suchen" value="${h(state.search)}"></label><div class="toolbar-right">${products?`<select id="category-filter" aria-label="Kategorie filtern"><option value="">Alle Kategorien</option>${categories.map(c=>`<option${c===state.category?' selected':''}>${h(c)}</option>`).join('')}</select><select id="activity-filter" aria-label="Produktstatus filtern"><option value="active"${state.activity==='active'?' selected':''}>Aktive Produkte</option><option value="all"${state.activity==='all'?' selected':''}>Alle Produkte</option><option value="archived"${state.activity==='archived'?' selected':''}>Archivierte Produkte</option></select>`:`<label class="filter-label">${icon('filter')}<select id="reason-filter" aria-label="Retourengrund filtern"><option value="">Alle Gründe</option>${[...new Set(state.returns.map(r=>r.reason))].sort().map(r=>`<option${r===state.category?' selected':''}>${h(r)}</option>`).join('')}</select></label>`}<button class="icon-btn" data-export="${kind}" aria-label="CSV exportieren" title="CSV exportieren">${icon('download')}</button></div></div><div id="table-content">${filteredTable()}</div><div class="table-footer"><span id="result-count"></span><span>CSV-Import & Export verfügbar</span></div></section>`;
}
function filteredItems(){
  const q=state.search.toLocaleLowerCase('de-DE');
  return (state.view==='products'?state.products:state.returns).filter(item=>{
    const keys=state.view==='products'?['name','sku','ean','supplier','manufacturer','category']:['returnNumber','productName','sku','ean','supplier','serialNumber','orderNumber','reason','notes'];
    if(q&&!keys.some(key=>String(item[key]??'').toLocaleLowerCase('de-DE').includes(q)))return false;
    if(state.view==='products')return (!state.category||item.category===state.category)&&(state.activity==='all'||(state.activity==='active'?item.active:!item.active));
    return (!state.status||item.status===state.status)&&(!state.category||item.reason===state.category);
  });
}
function filteredTable(){const rows=filteredItems();return state.view==='products'?productTable(rows):returnTable(rows);}
function empty(kind,filtered=false){return `<div class="empty-state"><span class="empty-icon">${icon(kind==='products'?'box':'return')}</span><h3>${filtered?'Keine passenden Einträge':kind==='products'?'Dein Produktbestand wartet auf dich':'Noch keine Retouren erfasst'}</h3><p>${filtered?'Passe deine Suche oder die Filter an.':kind==='products'?'Lege dein erstes Produkt an oder importiere eine CSV-Datei.':'Sobald eine Retoure eingeht, kannst du sie hier erfassen.'}</p>${filtered?'<button class="btn secondary" id="clear-filters">Filter zurücksetzen</button>':createButton(kind,kind==='products'?'Produkt anlegen':'Erste Retoure erfassen')}</div>`;}
function returnTable(rows,compact=false){
  if(!rows.length)return empty('returns',state.view==='returns'&&(!!state.search||!!state.status||!!state.category));
  return `<div class="table-scroll"><table><thead><tr><th>Retoure / Produkt</th>${!compact?'<th>Lieferant</th><th>Seriennummer</th><th>Retourengrund</th>':''}<th>Eingang</th><th>Status</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${rows.map(r=>`<tr><td><div class="product-cell">${avatar(r.productName)}<div><button class="row-link" data-detail="returns" data-id="${r.id}">${h(r.productName)}</button><small>${h(r.returnNumber)}${!compact?' · '+h(r.sku):''}</small></div></div></td>${!compact?`<td>${h(r.supplier||'—')}</td><td class="mono">${h(r.serialNumber||'—')}</td><td>${h(r.reason)}</td>`:''}<td class="nowrap">${date(r.receiptDate)}</td><td>${badge(r.status)}</td><td><button class="icon-btn" data-detail="returns" data-id="${r.id}" aria-label="Details zu ${h(r.returnNumber)}">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function productTable(rows){
  if(!rows.length)return empty('products',!!state.search||!!state.category||state.activity!=='active');
  return `<div class="table-scroll"><table><thead><tr><th>Produkt</th><th>EAN</th><th>Lieferant</th><th>Kategorie</th><th>Preis</th><th>Status</th><th><span class="sr-only">Details</span></th></tr></thead><tbody>${rows.map(p=>`<tr><td><div class="product-cell">${avatar(p.name)}<div><button class="row-link" data-detail="products" data-id="${p.id}">${h(p.name)}</button><small>${h(p.sku)}${p.manufacturer?' · '+h(p.manufacturer):''}</small></div></div></td><td class="mono">${h(p.ean||'—')}</td><td>${h(p.supplier||'—')}</td><td>${p.category?`<span class="category-tag">${h(p.category)}</span>`:'—'}</td><td class="nowrap">${currency(p.priceCents)}</td><td><span class="status ${p.active?'done':'archived'}"><span></span>${p.active?'Aktiv':'Archiviert'}</span></td><td><button class="icon-btn" data-detail="products" data-id="${p.id}" aria-label="Details zu ${h(p.name)}">${icon('chevron')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
function bindActions(root){
  root.querySelectorAll('[data-create]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>el.dataset.create==='products'?productForm(ctx):returnForm(ctx)));
  root.querySelectorAll('[data-detail]').forEach(el=>el.onclick=()=>{const kind=el.dataset.detail,item=state[kind].find(r=>r.id===Number(el.dataset.id));if(item)showDetails(ctx,kind,item);});
  root.querySelectorAll('[data-import]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>openImport(ctx,el.dataset.import)));
  root.querySelectorAll('[data-export]').forEach(el=>el.onclick=()=>ctx.ensureUnlocked(()=>openExport(el.dataset.export)));
  root.querySelectorAll('[data-unlock]').forEach(el=>el.onclick=accessClick);
  root.querySelector('#clear-filters')?.addEventListener('click',()=>{state.search='';state.status='';state.category='';state.activity='active';render();});
}
function refreshRows(){
  document.querySelector('#table-content').innerHTML=filteredTable();
  bindActions(document.querySelector('#table-content'));
  document.querySelector('#result-count').textContent=`${filteredItems().length} von ${state[state.view].length} Einträgen`;
}
function bindContent(){
  const root=document.querySelector('#content');if(state.view==='admin'){bindAdmin(ctx,root);return;}bindActions(root);
  root.querySelector('#search')?.addEventListener('input',event=>{state.search=event.target.value;refreshRows();});
  for(const [id,key] of [['category-filter','category'],['reason-filter','category'],['activity-filter','activity']])root.querySelector('#'+id)?.addEventListener('change',event=>{state[key]=event.target.value;refreshRows();});
  root.querySelectorAll('[data-status]').forEach(el=>el.onclick=()=>{state.status=el.dataset.status;render();});
  if(state.view!=='overview')document.querySelector('#result-count').textContent=`${filteredItems().length} von ${state[state.view].length} Einträgen`;
}
function route(){const next=location.hash.slice(1);state.view=Object.hasOwn(labels,next)?next:'overview';state.search='';state.status='';state.category='';render();}
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
document.querySelector('#access-button').onclick=accessClick;document.querySelector('#header-access').onclick=accessClick;
document.querySelector('#sidebar-import').onclick=()=>ctx.ensureUnlocked(()=>openImport(ctx,state.view==='returns'?'returns':'products'));
document.querySelector('#sidebar-export').onclick=()=>ctx.ensureUnlocked(()=>openExport(state.view==='returns'?'returns':'products'));
window.addEventListener('hashchange',route);
state.view=Object.hasOwn(labels,location.hash.slice(1))?location.hash.slice(1):'overview';
try{await ctx.reload();}catch(error){document.querySelector(ctx.unlocked?'#content':'#auth-page').innerHTML=`<div class="empty-state"><span class="empty-icon">${icon('info')}</span><h1>Verbindung fehlgeschlagen</h1><p>${h(error.message)}</p><button class="btn secondary" id="retry">${icon('refresh')}Erneut versuchen</button></div>`;document.querySelector('#retry').onclick=()=>location.reload();}
setInterval(async()=>{if(document.visibilityState!=='visible')return;try{ctx.applySession(await ctx.api('/api/session'));if(!ctx.unlocked)return;if(document.querySelector('#dialog').open||document.activeElement?.matches('input,select,textarea'))return;await ctx.reload();}catch{/* Keep current data during a temporary outage. */}},30000);
