import { resolve } from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT muss zwischen 1 und 65535 liegen.');
if (process.env.NODE_ENV === 'production' && (!process.env.PUBLIC_ORIGIN?.startsWith('https://') || process.env.SECURE_COOKIES !== 'true')) {
  throw new Error('Produktionsbetrieb benötigt PUBLIC_ORIGIN=https://… und SECURE_COOKIES=true.');
}
const app = createApp({
  dbPath:resolve(process.env.DB_PATH || 'data/retouren.sqlite'),
  secureCookies:process.env.SECURE_COOKIES === 'true', publicOrigin:process.env.PUBLIC_ORIGIN || ''
});
app.server.listen(port,host,() => console.log(`Retourenverwaltung läuft auf http://${host}:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,async () => { await app.close(); process.exit(0); });
