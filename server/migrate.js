import {REASONS, CONDITIONS, STATUSES, RESOLUTIONS, PRODUCT_REFS, RETURN_REFS} from '../shared/model.js';

export const nameKey = name => name.trim().normalize('NFKC').toLocaleLowerCase('de-DE');
export function migrateDatabase(db) {
  db.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
  if (db.prepare('SELECT name FROM migrations WHERE name=?').get('admin-v2')) return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE masterdata (
      id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL, nameKey TEXT NOT NULL,
      code TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      isDefault INTEGER NOT NULL DEFAULT 0, isClosed INTEGER NOT NULL DEFAULT 0, tone TEXT NOT NULL DEFAULT 'received',
      createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL, UNIQUE(kind,nameKey));`);
    const now = new Date().toISOString();
    function ensure(kind, name, isDefault=false, isClosed=false, tone='received') {
      if (!name?.trim()) return null;
      db.prepare('INSERT OR IGNORE INTO masterdata(kind,name,nameKey,isDefault,isClosed,tone,createdAt,updatedAt) VALUES(?,?,?,?,?,?,?,?)')
        .run(kind,name.trim(),nameKey(name),Number(isDefault),Number(isClosed),tone,now,now);
      return db.prepare('SELECT id FROM masterdata WHERE kind=? AND nameKey=?').get(kind,nameKey(name)).id;
    }
    for (const [kind,names,fallback] of [['reasons',REASONS,'Sonstiges'],['conditions',CONDITIONS,'Ungeprüft'],['statuses',STATUSES,'Eingegangen'],['resolutions',RESOLUTIONS,'Noch offen']]) {
      names.forEach((name,i)=>ensure(kind,name,name===fallback,kind==='statuses'&&i===3,kind==='statuses'?['received','checking','working','done'][i]:'received'));
    }
    for (const [table,refs] of [['products',PRODUCT_REFS],['returns',RETURN_REFS]]) {
      const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name));
      for (const field of Object.keys(refs)) if (!columns.has(field+'Id')) db.exec(`ALTER TABLE ${table} ADD COLUMN ${field}Id INTEGER REFERENCES masterdata(id)`);
      if (table==='returns'&&!columns.has('supplier')) db.exec("ALTER TABLE returns ADD COLUMN supplier TEXT NOT NULL DEFAULT ''");
      for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
        for (const [field,kind] of Object.entries(refs)) {
          const name = table==='returns'&&field==='supplier' ? db.prepare('SELECT supplier FROM products WHERE id=?').get(row.productId)?.supplier : row[field];
          const id=ensure(kind,name);
          db.prepare(`UPDATE ${table} SET ${field}Id=? WHERE id=?`).run(id,row.id);
        }
      }
    }
    db.prepare('INSERT INTO migrations(name) VALUES(?)').run('admin-v2');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
}
