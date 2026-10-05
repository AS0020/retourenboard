import { InputError } from './model.js';

export function parseCsv(source) {
  if (typeof source !== 'string' || source.length > 2_000_000) throw new InputError('CSV darf maximal 2 MB Text enthalten.');
  const text = source.replace(/^\uFEFF/, '');
  if (!text.trim()) throw new InputError('Die CSV-Datei ist leer.');
  let quote = false, commas = 0, semicolons = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') { if (quote && text[i+1] === '"') i++; else quote = !quote; }
    else if (!quote && (c === '\n' || c === '\r')) break;
    else if (!quote && c === ',') commas++;
    else if (!quote && c === ';') semicolons++;
  }
  const delimiter = semicolons >= commas ? ';' : ',';
  const records = []; let values = [], value = '', quoted = false, closed = false, line = 1, startLine = 1;
  const cell = () => { values.push(value); value = ''; closed = false; };
  const row = () => {
    cell();
    if (values.length > 50) throw new InputError(`Zeile ${startLine}: maximal 50 Spalten.`);
    if (!(values.length === 1 && values[0].trim() === '')) records.push({line:startLine, values});
    if (records.length > 10001) throw new InputError('Maximal 10.000 Datenzeilen pro Import.');
    values = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i+1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else { value += c; if (c === '\n' || (c === '\r' && text[i+1] !== '\n')) line++; }
    } else if (c === delimiter) cell();
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i+1] === '\n') i++;
      row(); line++; startLine = line;
    } else if (c === '"') {
      if (value || closed) throw new InputError(`Zeile ${line}: unerwartetes Anführungszeichen.`);
      quoted = true;
    } else {
      if (closed) throw new InputError(`Zeile ${line}: ungültige Zeichen nach einem Anführungszeichen.`);
      value += c;
    }
  }
  if (quoted) throw new InputError(`Zeile ${startLine}: Anführungszeichen wurde nicht geschlossen.`);
  if (value || values.length || closed) row();
  const headers = records.shift()?.values.map(h => h.trim());
  if (!headers?.length || headers.some(h => !h) || new Set(headers).size !== headers.length) throw new InputError('Spaltenüberschriften müssen vorhanden und eindeutig sein.');
  for (const record of records) if (record.values.length !== headers.length) throw new InputError(`Zeile ${record.line}: Anzahl der Spalten stimmt nicht mit der Kopfzeile überein.`);
  return {headers, rows:records, delimiter};
}
export function exportCsv(headers, rows) {
  const cell = input => {
    let value = String(input ?? '');
    if (/^[\s\uFEFF]*[=+\-@]/.test(value) || /^[\t\r\n]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map(row => row.map(cell).join(';')).join('\r\n') + '\r\n';
}
