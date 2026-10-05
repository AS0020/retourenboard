import {renderAttachments} from './attachments.js';
export const h = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const shapes = {
  settings:'<path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
  dashboard:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  return:'<path d="M9 4L4 9l5 5M4 9h10a6 6 0 010 12h-3"/>',
  box:'<path d="M12 3l9 5v9l-9 5-9-5V8l9-5zM3 8l9 5 9-5M12 13v9M7.5 5.5l9 5"/>',
  upload:'<path d="M12 16V3m-5 5l5-5 5 5M4 16v4a1 1 0 001 1h14a1 1 0 001-1v-4"/>',
  download:'<path d="M12 3v13m-5-5l5 5 5-5M4 17v3a1 1 0 001 1h14a1 1 0 001-1v-3"/>',
  lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3M12 14v3"/>',
  unlock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 017-2M12 14v3"/>',
  chevron:'<path d="M9 5l7 7-7 7"/>', plus:'<path d="M12 5v14M5 12h14"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M16 16l5 5"/>',
  check:'<path d="M5 12l4 4L19 6"/>', clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  close:'<path d="M6 6l12 12M18 6L6 18"/>', filter:'<path d="M4 7h16M7 12h10M10 17h4"/>',
  edit:'<path d="M15 5l4 4M4 20l4-1L20 7a2.8 2.8 0 00-4-4L4 15v5z"/>',
  trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4M17 3v4M3 11h18"/>',
  arrow:'<path d="M4 12h16M14 6l6 6-6 6"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>',
  file:'<path d="M14 2H5v20h14V7l-5-5zM14 2v5h5M8 12h8M8 16h8"/>',
  refresh:'<path d="M20 7A9 9 0 004 8M4 3v5h5M4 17a9 9 0 0016-1M20 21v-5h-5"/>'
};
export const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[name] ?? shapes.box}</svg>`;
export function openDialog({title,subtitle='',body,wide=false}) {
  const dialog = document.querySelector('#dialog');
  if (dialog.open) dialog.close();
  dialog.className = wide ? 'wide' : '';
  dialog.innerHTML = `<div class="dialog-header"><div><h2 id="dialog-title">${h(title)}</h2>${subtitle ? `<p>${h(subtitle)}</p>` : ''}</div><button type="button" class="icon-btn dialog-close" aria-label="Schließen">${icon('close')}</button></div>${body}`;
  dialog.querySelector('.dialog-close').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-close]').forEach(btn => btn.onclick = () => dialog.close());
  dialog.onclick = event => { if (event.target === dialog) { const rect=dialog.getBoundingClientRect(); if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom) dialog.close(); } };
  dialog.showModal(); return dialog;
}
const input = (key,label,value='',opts={}) => `<label class="field ${opts.full ? 'full' : ''}"><span>${h(label)}${opts.required ? ' <b>*</b>' : ''}</span><input name="${key}" value="${h(value)}" type="${opts.type ?? 'text'}" ${opts.required ? 'required' : ''} ${opts.type === 'number' ? 'min="1" max="10000" step="1"' : ''} maxlength="${opts.max ?? 250}" placeholder="${h(opts.placeholder ?? '')}">${opts.help ? `<small>${h(opts.help)}</small>` : ''}</label>`;
function masterSelect(ctx,key,label,kind,item,required=false){
  const entries=ctx.masterdata[kind]??[],value=item[key]??(required?entries.find(x=>x.active&&x.isDefault)?.id:null);
  const available=entries.filter(x=>x.active||x.id===value);
  return `<label class="field"><span>${label}${required?' <b>*</b>':' <small>(optional)</small>'}</span><select name="${key}" ${required?'required':''}>${required?'':'<option value="">Keine Zuordnung</option>'}${available.map(x=>`<option value="${x.id}"${x.id===value?' selected':''}>${h(x.name)}${x.active?'':' (archiviert)'}</option>`).join('')}</select>${!entries.some(x=>x.active)?'<small>Werte zuerst im Adminbereich anlegen.</small>':''}</label>`;
}
function bindForm(dialog,ctx,path,method) {
  const form = dialog.querySelector('form');
  form.onsubmit = async event => {
    event.preventDefault(); const button = form.querySelector('[type=submit]'), error = form.querySelector('.form-error');
    button.disabled = true; error.hidden = true;
    try {
      const body = Object.fromEntries(new FormData(form));
      if ('active' in body) body.active = body.active === 'true';
      await ctx.api(path,{method,body}); dialog.close(); await ctx.reload(); ctx.toast('Änderungen gespeichert.');
    } catch(err) { error.textContent = err.message; error.hidden = false; }
    finally { button.disabled = false; }
  };
}
export function productForm(ctx,item = {}) {
  const dialog = openDialog({title:item.id ? 'Produkt bearbeiten' : 'Neues Produkt',subtitle:'Produktdaten für den gemeinsamen Bestand.',body:`
    <form><div class="dialog-body"><div class="form-grid">
    ${input('name','Produktname',item.name,{required:true,full:true,placeholder:'z. B. kabelloser Kopfhörer'})}
    ${input('sku','Artikelnummer',item.sku,{required:true,max:100,placeholder:'z. B. KH-001'})}
    ${input('ean','EAN',item.ean,{placeholder:'8, 12, 13 oder 14 Ziffern',help:'Führende Nullen bleiben erhalten.'})}
    ${masterSelect(ctx,'manufacturerId','Hersteller','manufacturers',item)}
    ${masterSelect(ctx,'supplierId','Lieferant','suppliers',item)}
    ${masterSelect(ctx,'categoryId','Kategorie','categories',item)}
    ${input('price','Verkaufspreis (€)',item.priceCents === undefined ? '' : (item.priceCents/100).toFixed(2).replace('.',','),{placeholder:'0,00'})}
    <label class="field full"><span>Beschreibung</span><textarea name="description" maxlength="5000" rows="3" placeholder="Weitere Produktinformationen …">${h(item.description)}</textarea></label>
    <label class="field full"><span>Produktstatus</span><select name="active"><option value="true">Aktiv</option><option value="false"${item.active===false?' selected':''}>Archiviert</option></select></label>
    </div><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" type="button" data-close>Abbrechen</button><button class="btn primary" type="submit">${icon('check')}Produkt speichern</button></div></form>`});
  bindForm(dialog,ctx,`/api/products${item.id ? '/'+item.id : ''}`,item.id?'PUT':'POST');
}
export function returnForm(ctx,item = {}) {
  const available = ctx.products.filter(p=>p.active || p.id===item.productId);
  if (!available.length) { ctx.toast('Bitte zuerst ein Produkt anlegen.'); return productForm(ctx); }
  const today = new Intl.DateTimeFormat('sv-SE').format(new Date());
  const dialog = openDialog({title:item.id ? 'Retoure bearbeiten' : 'Neue Retoure',subtitle:item.returnNumber || 'Vom Eingang bis zum Abschluss alles festhalten.',body:`
    <form><div class="dialog-body"><div class="form-grid">
    <label class="field full"><span>Produkt <b>*</b></span><select name="productId" required><option value="">Produkt auswählen …</option>${available.map(p=>`<option value="${p.id}"${p.id===item.productId?' selected':''}>${h(p.name)} · ${h(p.sku)}</option>`).join('')}</select></label>
    ${masterSelect(ctx,'supplierId','Lieferant','suppliers',item)}
    ${input('serialNumber','Seriennummer',item.serialNumber,{placeholder:'Seriennummer des Geräts'})}
    ${input('orderNumber','Bestellnummer',item.orderNumber,{placeholder:'z. B. BEST-2026-001'})}
    ${input('receiptDate','Eingangsdatum',item.receiptDate || today,{required:true,type:'date'})}
    ${input('quantity','Menge',item.quantity || 1,{required:true,type:'number'})}
    ${masterSelect(ctx,'reasonId','Retourengrund','reasons',item,true)}
    ${masterSelect(ctx,'conditionId','Zustand','conditions',item,true)}
    ${masterSelect(ctx,'statusId','Bearbeitungsstatus','statuses',item,true)}
    ${masterSelect(ctx,'resolutionId','Lösung','resolutions',item,true)}
    <label class="field full"><span>Notizen</span><textarea name="notes" maxlength="5000" rows="3" placeholder="Prüfergebnis, Zubehör oder weitere Hinweise …">${h(item.notes)}</textarea><small>Diese Angaben sind für alle angemeldeten Personen sichtbar.</small></label>
    </div><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button type="button" class="btn secondary" data-close>Abbrechen</button><button type="submit" class="btn primary">${icon('check')}Retoure speichern</button></div></form>`});
  bindForm(dialog,ctx,`/api/returns${item.id?'/'+item.id:''}`,item.id?'PUT':'POST');
  dialog.querySelector('[name=productId]').onchange=event=>{
    const p=available.find(x=>x.id===Number(event.target.value));
    const supplier=ctx.masterdata.suppliers?.find(x=>x.id===p?.supplierId&&x.active);
    dialog.querySelector('[name=supplierId]').value=supplier?.id??'';
  };
}
export function showDetails(ctx,kind,item) {
  const product = kind === 'products';
  const fields = product ? {sku:'Artikelnummer',ean:'EAN',manufacturer:'Hersteller',supplier:'Lieferant',category:'Kategorie',description:'Beschreibung'} : {productName:'Produkt',sku:'Artikelnummer',ean:'EAN',supplier:'Lieferant',serialNumber:'Seriennummer',orderNumber:'Bestellnummer',receiptDate:'Eingangsdatum',quantity:'Menge',reason:'Retourengrund',condition:'Zustand',status:'Status',resolution:'Lösung',notes:'Notizen'};
  const dialog = openDialog({title:product?item.name:item.returnNumber,subtitle:product?'Produktdetails':'Retourendetails',wide:!product,body:`<div class="dialog-body"><dl class="detail-grid">${Object.entries(fields).map(([key,label])=>`<div${['notes','description'].includes(key)?' class="full"':''}><dt>${label}</dt><dd>${h(item[key] || '—')}</dd></div>`).join('')}${product?`<div><dt>Verkaufspreis</dt><dd>${(item.priceCents/100).toLocaleString('de-DE',{style:'currency',currency:'EUR'})}</dd></div><div><dt>Produktstatus</dt><dd>${item.active?'Aktiv':'Archiviert'}</dd></div>`:''}</dl>${product?'':'<section class="attachments" id="return-attachments"></section>'}</div><div class="dialog-footer"><button class="btn danger" id="delete-item">${icon('trash')}Löschen</button><button class="btn primary" id="edit-item">${icon('edit')}Bearbeiten</button></div>`});
  if(!product)renderAttachments(ctx,item.id,dialog.querySelector('#return-attachments'));
  dialog.querySelector('#edit-item').onclick = () => ctx.ensureUnlocked(()=>product?productForm(ctx,item):returnForm(ctx,item));
  dialog.querySelector('#delete-item').onclick = () => ctx.ensureUnlocked(()=>confirmDelete(ctx,kind,item));
}
function confirmDelete(ctx,kind,item) {
  const dialog = openDialog({title:'Eintrag löschen?',subtitle:kind==='products'?'Produkte mit verknüpften Retouren werden archiviert.':'Die Retoure und ihre Dateianhänge werden dauerhaft entfernt.',body:`<div class="dialog-body"><p><strong>${h(item.name || item.returnNumber)}</strong></p><p class="muted">Bitte bestätige diese Änderung am gemeinsamen Bestand.</p><p class="form-error" role="alert" hidden></p></div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button id="confirm-delete" class="btn danger">${icon('trash')}Bestätigen</button></div>`});
  dialog.querySelector('#confirm-delete').onclick = async event => {
    event.currentTarget.disabled=true;
    try { const result=await ctx.api(`/api/${kind}/${item.id}`,{method:'DELETE'}); dialog.close(); await ctx.reload(); ctx.toast(result.archived?'Produkt archiviert.':'Eintrag gelöscht.'); }
    catch(error) { const el=dialog.querySelector('.form-error'); el.textContent=error.message;el.hidden=false; event.target.disabled=false; }
  };
}
