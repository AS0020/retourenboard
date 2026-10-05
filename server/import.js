import { parseCsv } from '../shared/csv.js';
import { PRODUCT_COLUMNS, RETURN_COLUMNS, PRODUCT_REFS, InputError } from '../shared/model.js';

export function previewImport(store, kind, text, mapping, updateExisting = false) {
  if (!['products','returns'].includes(kind)) throw new InputError('Unbekannter Importtyp.');
  if (!mapping || typeof mapping !== 'object' || Array.isArray(mapping)) throw new InputError('Spaltenzuordnung fehlt.');
  if (typeof updateExisting !== 'boolean') throw new InputError('Ungültige Update-Option.');
  const parsed = parseCsv(text), columns = kind === 'products' ? PRODUCT_COLUMNS : RETURN_COLUMNS;
  const selected = Object.entries(mapping).filter(([,index]) => index !== '' && index !== null && index !== -1);
  for (const [key,index] of selected) {
    if (!Object.hasOwn(columns,key) || !Number.isInteger(index) || index < 0 || index >= parsed.headers.length) throw new InputError('Ungültige Spaltenzuordnung.');
  }
  const required = kind === 'products' ? ['sku','name'] : ['sku','receiptDate'];
  if (required.some(key => !selected.some(([field]) => field === key))) throw new InputError('Bitte alle Pflichtspalten zuordnen.');
  if (!parsed.rows.length) throw new InputError('Die CSV-Datei enthält keine Datenzeilen.');
  const seen = new Set(), rows = [], errors = [];
  for (const record of parsed.rows) {
    try {
      const input = Object.fromEntries(selected.map(([key,index]) => [key,record.values[index]]));
      let data, action = 'create', id;
      if (kind === 'products') {
        const existing = store.findProduct(input.sku.trim());
        if (existing && !updateExisting) throw new InputError('Artikelnummer existiert bereits. Aktualisierung ausdrücklich aktivieren.');
        const values={...existing,...input};
        for(const field of Object.keys(PRODUCT_REFS))if(Object.hasOwn(input,field))delete values[field+'Id'];
        data = store.prepareProduct(values,existing?.id);
        if (seen.has(data.sku)) throw new InputError('Artikelnummer kommt mehrfach in dieser Datei vor.');
        seen.add(data.sku);
        if (existing) { action = 'update'; id = existing.id; }
      } else {
        const product = store.findProduct(input.sku.trim());
        if (!product || !product.active) throw new InputError('Artikelnummer ist unbekannt oder archiviert. Produkte zuerst importieren.');
        data = store.prepareReturn({...input, productId:product.id});
        if (data.returnNumber) {
          if (seen.has(data.returnNumber) || store.findReturn(data.returnNumber)) throw new InputError('Retourennummer existiert bereits.');
          seen.add(data.returnNumber);
        }
        data.sku = product.sku;
      }
      rows.push({line:record.line, data, action, id});
    } catch (error) {
      if (!(error instanceof InputError)) throw error;
      errors.push({line:record.line, message:error.message});
    }
  }
  return {headers:parsed.headers, total:parsed.rows.length, rows, errors};
}
export function commitImport(store, kind, text, mapping, updateExisting = false) {
  return store.transaction(() => {
    const preview = previewImport(store,kind,text,mapping,updateExisting);
    if (preview.errors.length) throw new InputError(`Import abgebrochen: ${preview.errors.length} fehlerhafte Zeile(n). ${preview.errors[0].message}`);
    let created = 0, updated = 0;
    for (const row of preview.rows) {
      if (kind === 'returns') { store.createReturn(row.data); created++; }
      else if (row.action === 'update') { store.updateProduct(row.id,row.data); updated++; }
      else { store.createProduct(row.data); created++; }
    }
    return {created,updated};
  });
}
