import { h, icon, openDialog } from './forms.js';
import { PRODUCT_COLUMNS, RETURN_COLUMNS } from '/shared/model.js';
import { parseCsv } from '/shared/csv.js';
import { createImportSession } from '/shared/import-session.js';

export function openExport(kind='products'){
  openDialog({title:'CSV exportieren',subtitle:'Den vollständigen gemeinsamen Bestand als CSV herunterladen.',body:`<div class="dialog-body"><a class="export-option" href="/api/export/products">${icon('box')}<div><strong>Produkte exportieren</strong><small>Mit EAN, Lieferant und Verkaufspreis</small></div>${icon('download')}</a><a class="export-option" href="/api/export/returns">${icon('return')}<div><strong>Retouren exportieren</strong><small>Mit Lieferant, Seriennummer, Status und Prüfergebnis</small></div>${icon('download')}</a><p class="muted small-text">UTF-8 · Semikolon als Trennzeichen · Für Tabellenprogramme geeignet</p></div><div class="dialog-footer"><button class="btn secondary" data-close>Schließen</button></div>`});
}
export function openImport(ctx,initialKind='products'){
  let kind=initialKind,text='',parsed=null,preview=null;
  const importSession=createImportSession();
  const dialog=openDialog({title:'CSV importieren',subtitle:'Datei auswählen, Spalten zuordnen und vor dem Import prüfen.',wide:true,body:`<div class="import-steps"><span class="active">01 <b>Datei & Spalten</b></span><span id="step-preview">02 <b>Vorschau & Import</b></span></div><div class="dialog-body"><div class="import-controls"><label class="field"><span>Was möchtest du importieren?</span><select id="import-kind"><option value="products"${kind==='products'?' selected':''}>Produkte</option><option value="returns"${kind==='returns'?' selected':''}>Retouren</option></select></label><a id="template-link" class="text-link" href="/api/template/${kind}">${icon('download')}CSV-Vorlage herunterladen</a></div><label class="drop-zone" id="drop-zone">${icon('upload')}<strong>CSV-Datei auswählen</strong><span>oder hierher ziehen · UTF-8 · maximal 2 MB</span><input id="csv-file" type="file" accept=".csv,text/csv" aria-label="CSV-Datei auswählen"></label><details class="paste-csv"><summary>CSV-Text direkt einfügen</summary><textarea id="csv-text" rows="4" placeholder="Artikelnummer;Produktname;Lieferant&#10;ART-001;Mein Produkt;Mein Lieferant" aria-label="CSV-Text"></textarea><button id="use-text" class="btn secondary small">Text übernehmen</button></details><p class="muted small-text">Lieferanten, Hersteller, Kategorien und Retourenoptionen zuerst im Adminbereich anlegen. CSV-Namen müssen dort vorhanden sein. Der Lieferant ist optional.</p><div id="mapping"></div><label id="update-option" class="checkbox-field" hidden><input id="update-existing" type="checkbox">Vorhandene Produkte anhand der Artikelnummer aktualisieren</label><p class="form-error" id="import-error" role="alert" hidden></p><div id="preview"></div></div><div class="dialog-footer"><button class="btn secondary" data-close>Abbrechen</button><button id="preview-button" class="btn secondary" disabled>${icon('search')}Vorschau prüfen</button><button id="commit-button" class="btn primary" disabled>${icon('upload')}Importieren</button></div>`});
  const $=id=>dialog.querySelector('#'+id),columns=()=>kind==='products'?PRODUCT_COLUMNS:RETURN_COLUMNS;
  const normalize=value=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const aliases={sku:['sku','artikelnummer','artnr','artikelnr'],name:['name','produktname','produkt'],supplier:['lieferant','supplier'],receiptDate:['eingangsdatum','datum','receiptdate'],serialNumber:['seriennummer','serialnumber','sn'],price:['preis','verkaufspreis','price']};
  function clearPreview(){importSession.invalidate();preview=null;$('preview').innerHTML='';$('commit-button').disabled=true;$('step-preview').classList.remove('active');}
  function showError(error){$('import-error').textContent=error.message || error;$('import-error').hidden=false;}
  function useText(source,filename){
    clearPreview();$('import-error').hidden=true;$('preview-button').disabled=true;parsed=null;$('mapping').innerHTML='';$('update-option').hidden=true;
    try{
      parsed=parseCsv(source);text=source;
      $('drop-zone').querySelector('strong').textContent=filename || `${parsed.rows.length} Datenzeilen erkannt`;
      const required=kind==='products'?['sku','name']:['sku','receiptDate'];
      $('mapping').innerHTML=`<h3 class="mapping-title">Spalten zuordnen <span>${parsed.rows.length} Zeilen gefunden</span></h3><div class="mapping-grid">${Object.entries(columns()).map(([key,label])=>{
        const index=parsed.headers.findIndex(header=>[normalize(label),normalize(key),...(aliases[key]||[])].includes(normalize(header)));
        return `<label class="field"><span>${label}${required.includes(key)?' <b>*</b>':''}</span><select data-column="${key}"><option value="-1">Nicht importieren</option>${parsed.headers.map((header,i)=>`<option value="${i}"${i===index?' selected':''}>${h(header)}</option>`).join('')}</select></label>`;
      }).join('')}</div>`;
      $('mapping').querySelectorAll('select').forEach(el=>el.onchange=clearPreview);
      $('preview-button').disabled=false;$('update-option').hidden=kind!=='products';
    }catch(error){showError(error);}
  }
  async function loadFile(file){
    if(!file)return;
    try{if(file.size>2_000_000)throw new Error('Bitte eine CSV-Datei mit maximal 2 MB auswählen.');const source=new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer());useText(source,file.name);}
    catch(error){clearPreview();$('preview-button').disabled=true;showError(error instanceof TypeError?'Die Datei muss als UTF-8 gespeichert sein.':error);}
  }
  $('csv-file').onchange=event=>loadFile(event.target.files[0]);
  $('drop-zone').ondragover=event=>{event.preventDefault();$('drop-zone').classList.add('dragging');};
  $('drop-zone').ondragleave=()=> $('drop-zone').classList.remove('dragging');
  $('drop-zone').ondrop=event=>{event.preventDefault();$('drop-zone').classList.remove('dragging');loadFile(event.dataTransfer.files[0]);};
  $('use-text').onclick=()=>useText($('csv-text').value);
  $('import-kind').onchange=event=>{kind=event.target.value;$('template-link').href=`/api/template/${kind}`;if(text)useText(text);};
  $('update-existing').onchange=clearPreview;
  const payload=()=>({kind,text,mapping:Object.fromEntries([...$('mapping').querySelectorAll('[data-column]')].map(el=>[el.dataset.column,Number(el.value)])),updateExisting:kind==='products'&&$('update-existing').checked});
  $('preview-button').onclick=async()=>{
    $('preview-button').disabled=true;clearPreview();$('import-error').hidden=true;
    const pending=importSession.begin(payload());
    try{
      const result=await ctx.api('/api/import/preview',{method:'POST',body:JSON.parse(pending.serialized)});
      if(!dialog.open||!importSession.accept(pending,result))return;
      preview=result;
      $('step-preview').classList.add('active');
      $('preview').innerHTML=`<div class="preview-summary ${preview.errors.length?'has-errors':'success'}">${icon(preview.errors.length?'info':'check')}<strong>${preview.errors.length?`${preview.errors.length} fehlerhafte Zeile(n) – bitte vor dem Import korrigieren.`:`${preview.total} Zeile(n) geprüft und bereit zum Import.`}</strong></div>${preview.errors.length?`<ul class="import-errors">${preview.errors.slice(0,30).map(e=>`<li><strong>Zeile ${e.line}:</strong> ${h(e.message)}</li>`).join('')}</ul>`:''}<div class="table-scroll preview-table"><table><thead><tr><th>Zeile</th><th>Artikelnummer</th><th>${kind==='products'?'Produktname':'Seriennummer'}</th><th>Lieferant</th>${kind==='returns'?'<th>Eingangsdatum</th>':''}<th>Aktion</th></tr></thead><tbody>${preview.rows.slice(0,10).map(row=>`<tr><td>${row.line}</td><td>${h(row.data.sku)}</td><td>${h(kind==='products'?row.data.name:row.data.serialNumber||'—')}</td><td>${h(row.data.supplier||'—')}</td>${kind==='returns'?`<td>${h(row.data.receiptDate)}</td>`:''}<td>${row.action==='update'?'Aktualisieren':'Neu anlegen'}</td></tr>`).join('')}</tbody></table></div>${preview.rows.length>10?'<p class="muted small-text">Die Vorschau zeigt die ersten 10 gültigen Zeilen.</p>':''}`;
      $('commit-button').disabled=preview.errors.length>0||preview.rows.length===0;
      $('preview').scrollIntoView({behavior:'smooth',block:'nearest'});
    }catch(error){showError(error);}finally{$('preview-button').disabled=false;}
  };
  $('commit-button').onclick=async()=>{
    const commitPayload=importSession.getCommitPayload();
    if(!preview||!commitPayload)return;
    $('commit-button').disabled=true;$('preview-button').disabled=true;
    try{const result=await ctx.api('/api/import/commit',{method:'POST',body:commitPayload});dialog.close();await ctx.reload();ctx.toast(`Import abgeschlossen: ${result.created} neu, ${result.updated} aktualisiert.`);}
    catch(error){clearPreview();showError(error);}finally{$('preview-button').disabled=false;}
  };
}
