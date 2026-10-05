export const STATUSES = ['Eingegangen', 'In Prüfung', 'In Bearbeitung', 'Abgeschlossen'];
export const CONDITIONS = ['Ungeprüft', 'Neuwertig', 'Gebraucht', 'Beschädigt', 'Defekt'];
export const REASONS = ['Defekt', 'Falschlieferung', 'Nicht gefallen', 'Transportschaden', 'Unvollständig', 'Sonstiges'];
export const RESOLUTIONS = ['Noch offen', 'Erstattung', 'Austausch', 'Reparatur', 'Wiedereinlagerung'];
export const MASTER_KINDS = {suppliers:'Lieferanten', manufacturers:'Hersteller', categories:'Kategorien', reasons:'Retourengründe', conditions:'Zustände', statuses:'Status', resolutions:'Lösungen'};
export const PRODUCT_REFS = {supplier:'suppliers', manufacturer:'manufacturers', category:'categories'};
export const RETURN_REFS = {supplier:'suppliers', reason:'reasons', condition:'conditions', status:'statuses', resolution:'resolutions'};
export const PRODUCT_COLUMNS = {sku:'Artikelnummer', name:'Produktname', ean:'EAN', manufacturer:'Hersteller', supplier:'Lieferant', category:'Kategorie', price:'Preis', description:'Beschreibung', active:'Aktiv'};
export const RETURN_COLUMNS = {returnNumber:'Retourennummer', sku:'Artikelnummer', supplier:'Lieferant', serialNumber:'Seriennummer', orderNumber:'Bestellnummer', receiptDate:'Eingangsdatum', quantity:'Menge', reason:'Retourengrund', condition:'Zustand', status:'Status', resolution:'Lösung', notes:'Notizen'};

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
function text(input, key, label, required = false, max = 250) {
  const value = input[key] ?? '';
  if (typeof value !== 'string' || value.length > max) throw new InputError(`${label}: maximal ${max} Zeichen erlaubt.`);
  const result = value.trim();
  if (required && !result) throw new InputError(`${label} ist erforderlich.`);
  return result;
}
function choice(input, key, values, fallback) {
  const value = input[key] || fallback;
  if (!values.includes(value)) throw new InputError(`Ungültiger Wert für ${key}.`);
  return value;
}
export function validateProduct(input) {
  const ean = text(input, 'ean', 'EAN');
  if (ean && !/^(\d{8}|\d{12,14})$/.test(ean)) throw new InputError('EAN muss 8, 12, 13 oder 14 Ziffern enthalten.');
  let priceCents = input.priceCents ?? 0;
  if (input.price !== undefined && input.price !== '') {
    if (!['number','string'].includes(typeof input.price)) throw new InputError('Ungültiger Preis.');
    const price = String(input.price).trim().replace(',', '.');
    if (!/^\d{1,7}(\.\d{1,2})?$/.test(price)) throw new InputError('Preis muss ein positiver Betrag mit maximal zwei Nachkommastellen sein.');
    priceCents = Math.round(Number(price) * 100);
  }
  if (!Number.isSafeInteger(priceCents) || priceCents < 0 || priceCents > 999999999) throw new InputError('Ungültiger Preis.');
  let active = input.active ?? true;
  if (typeof active === 'string') {
    if (['true','1','ja','aktiv'].includes(active.toLowerCase())) active = true;
    else if (['false','0','nein','archiviert'].includes(active.toLowerCase())) active = false;
    else throw new InputError('Aktiv muss ja oder nein sein.');
  }
  if (typeof active !== 'boolean') throw new InputError('Ungültiger Aktivstatus.');
  return {
    name:text(input, 'name', 'Produktname', true), sku:text(input, 'sku', 'Artikelnummer', true, 100), ean,
    manufacturer:text(input, 'manufacturer', 'Hersteller'), supplier:text(input, 'supplier', 'Lieferant'),
    category:text(input, 'category', 'Kategorie'), priceCents, description:text(input, 'description', 'Beschreibung', false, 5000), active
  };
}
export function validateReturn(input, choices = {}) {
  const numeric = value => typeof value === 'number' || (typeof value === 'string' && /^\d+$/.test(value.trim()));
  if (!numeric(input.productId) || !numeric(input.quantity === undefined ? 1 : input.quantity)) throw new InputError('Produkt und Menge müssen gültige ganze Zahlen sein.');
  const productId = Number(input.productId), quantity = Number(input.quantity === undefined ? 1 : input.quantity);
  if (!Number.isSafeInteger(productId) || productId <= 0) throw new InputError('Bitte ein Produkt auswählen.');
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10000) throw new InputError('Menge muss zwischen 1 und 10.000 liegen.');
  const receiptDate = text(input, 'receiptDate', 'Eingangsdatum', true, 10);
  const date = new Date(`${receiptDate}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== receiptDate) throw new InputError('Bitte ein gültiges Eingangsdatum angeben.');
  return {
    productId, quantity, receiptDate, returnNumber:text(input, 'returnNumber', 'Retourennummer', false, 100),
    serialNumber:text(input, 'serialNumber', 'Seriennummer'), orderNumber:text(input, 'orderNumber', 'Bestellnummer'),
    reason:choice(input, 'reason', choices.reasons || REASONS, 'Sonstiges'), condition:choice(input, 'condition', choices.conditions || CONDITIONS, 'Ungeprüft'),
    status:choice(input, 'status', choices.statuses || STATUSES, 'Eingegangen'), resolution:choice(input, 'resolution', choices.resolutions || RESOLUTIONS, 'Noch offen'),
    notes:text(input, 'notes', 'Notizen', false, 5000)
  };
}
