<img width="1267" height="212" alt="image" src="https://github.com/user-attachments/assets/1a74c91e-51b6-4f7d-b18b-451c5464bcff" />

# retourenboard. – gemeinsame Retourenverwaltung

Deutsche Web-App für Produkte und Retouren. Alle angemeldeten Personen sehen denselben Bestand. Produkte, Retouren, Stammdaten, CSV-Exporte und Dateianhänge sind ausschließlich nach Anmeldung zugänglich. Der erste Account ist Administrator, weitere Konten legt der Admin an.

- Produkte: Artikelnummer, EAN, Hersteller, **Lieferant**, Kategorie, Preis und Beschreibung.
- Retouren: Produktzuordnung, optionaler eigener Lieferant, Seriennummer, Bestellnummer, Eingang, Menge, Grund, Zustand, Status, Lösung und Notizen.
- Adminbereich mit Administratorrechten für Lieferanten, Hersteller, Kategorien, Gründe, Zustände, Status und Lösungen.
- Geschützte Dateianhänge mit Bild- und PDF-Vorschau.
- Suche, Filter, Übersicht, CSV-Vorlagen sowie CSV-Import/Export.
- Dauerhafte SQLite-Datenbank, serverseitige Passwortprüfung und auf acht Stunden begrenzte Sitzungen.
- Hell-/Dunkelmodus für Login, Dashboard, Formulare und Dateiverwaltung.

Beim ersten Besuch folgt das Farbschema der Systemeinstellung. Über das Mond-/Sonnensymbol oben rechts kannst du wechseln; deine Auswahl bleibt im jeweiligen Browser gespeichert. Bilder und PDF-Seiten werden mit ihren ursprünglichen Farben dargestellt.

Die installierte Versionsnummer steht unten auf der Loginseite und im Dashboard. Sie wird aus `version` in `package.json` übernommen; für einen neuen Versionsstand diese Angabe ändern und die Installationsdatei mit `node scripts/build-linux-installer.mjs` neu erstellen. Nach einem Update den Dienst neu starten.

## Lokal starten

Benötigt Node.js ab 22.16; Node.js 24 LTS empfohlen. Es gibt keine zusätzlich zu installierenden npm-Pakete. Offizielle Downloads: https://nodejs.org/en/download

```powershell
Copy-Item .env.example .env
# Eine vorhandene .env beim Aktualisieren behalten.
npm start
```

Dann http://127.0.0.1:3000 öffnen und auf der Ersteinrichtungsseite den ersten Administrator mit Benutzername und persönlichem Passwort anlegen. Passwörter benötigen 12–256 Zeichen. Benutzername: 3–64 Buchstaben, Zahlen, Punkte, Bindestriche oder Unterstriche; Groß-/Kleinschreibung wird bei der Anmeldung ignoriert.

Tests:

```sh
npm test
```

In Umgebungen, die das Starten von Test-Unterprozessen blockieren:

```sh
node --test --experimental-test-isolation=none tests/*.test.js
```

## Konten und Anmeldung

Beim ersten Start gibt es genau eine Ersteinrichtung. Der erste Account erhält Administratorrechte. Richte ihn lokal oder über den SSH-Tunnel ein, bevor du den Server öffentlich zugänglich machst. Nach der Einrichtung gibt es keine öffentliche Registrierung.

Unter **Adminbereich → Benutzerkonten** legt der Administrator weitere Zugänge an. Die Standardrolle **Mitarbeiter** darf Produkte, Retouren, CSV-Importe und Dateianhänge bearbeiten. **Administratoren** verwalten zusätzlich Stammdaten und Konten. Konten lassen sich bearbeiten und deaktivieren; der letzte aktive Administrator kann nicht deaktiviert oder zum Mitarbeiter herabgestuft werden. Deaktivierung und Passwortwechsel beenden bestehende Sitzungen des betroffenen Kontos sofort; Rollenänderungen gelten beim nächsten Zugriff.

Beim Upgrade bleiben Produkte, Retouren und Anhänge erhalten. Persönliche Konten werden in derselben Datenbank ergänzt. Das frühere gemeinsame Passwort hat keine Funktion mehr; beim ersten Aufruf nach dem Upgrade legst du deinen Administrator an. Updates und Neustarts behalten danach alle Konten.

## Stammdaten, Produkte und Retouren

1. Als Administrator anmelden und den **Adminbereich** öffnen.
2. Lieferanten, Hersteller, Kategorien und gewünschte Retourenoptionen anlegen. Die bisherigen Retourenoptionen sind schon vorhanden.
3. Produkte anlegen und die Stammdaten auswählen. Artikelnummer, EAN, Preis und Beschreibung bleiben individuelle Eingaben.
4. Retouren erfassen und Produkt, Grund, Zustand, Status und Lösung auswählen.

Der Lieferant ist bei Produkten und Retouren **optional**. Bei Produktwahl wird dessen aktiver Lieferant vorausgewählt; eine andere Auswahl oder „Keine Zuordnung“ ist möglich. Die Retoure speichert ihren Lieferanten unabhängig vom Produkt. Spätere Änderungen am Produkt überschreiben ihn nicht.

Stammdaten können umbenannt, archiviert und wieder aktiviert werden. Entfernen löscht unbenutzte Werte und archiviert verwendete Werte. Archivierte Zuordnungen bleiben lesbar und können bei bestehenden Einträgen beibehalten werden. Pflichtlisten behalten mindestens einen aktiven Standard. Bei Status legt „Retouren mit diesem Status sind abgeschlossen“ fest, welche Vorgänge in den Kennzahlen als abgeschlossen zählen. Adminnotizen und Lieferantencodes sind nur für Administratoren sichtbar.

Bestehende V1-Datenbanken werden beim Start einmalig und transaktional erweitert. Vorhandene Namen werden übernommen; bisherige Retouren erhalten den bisherigen Produktlieferanten. Weitere Starts überschreiben diese Zuordnungen nicht. Vor Updates das gesamte Datenverzeichnis sichern.

## Dateianhänge

Eine gespeicherte Retoure öffnen, unter **Dateianhänge** Dateien auswählen und „Hochladen“ drücken. Maximal zehn Dateien pro Retoure, jeweils 10 MiB (10.485.760 Bytes). Unterstützt werden PDF, PNG, JPEG (.jpg/.jpeg) und WebP; der Server prüft Dateiendung und Binärsignatur. Bilder erscheinen als Vorschau. PDFs lassen sich mit Seitenwechsel direkt anzeigen und zusätzlich öffnen oder herunterladen. Beschädigte oder verschlüsselte PDFs können heruntergeladen werden, auch wenn die Vorschau nicht verfügbar ist.

**Anhänge, Vorschau und Downloads sind nur nach Anmeldung sichtbar.** Hochladen und Entfernen benötigen ein angemeldetes Konto. Beim Löschen einer Retoure werden auch ihre Anhänge entfernt. Mehrere ausgewählte Dateien werden einzeln hochgeladen; bei einem Fehler zeigt die Oberfläche an, wie viele bereits gespeichert wurden.

Die Dateien liegen im Ordner `attachments/` neben der SQLite-Datenbank. Unter Linux ist das `/var/lib/retourenverwaltung/attachments/`, in Docker `/data/attachments/`. Updates erhalten diesen Datenspeicher. Immer Datenbank und Anhänge gemeinsam sichern.

Die PDF-Vorschau verwendet lokal mitgeliefertes [Mozilla PDF.js](https://mozilla.github.io/pdf.js/) 6.4.299; beim Betrachten wird kein externer Dienst angesprochen. Lizenz- und Herkunftshinweise liegen unter `public/vendor/pdfjs/`. Es bleibt keine npm-Installation zum Start nötig.

## Linux installieren

Am einfachsten mit der einzelnen Datei **`retourenboard-install.sh`**. Unterstützt Debian/Ubuntu mit laufendem systemd, x86_64 oder ARM64 und Internetzugang.

Du kannst die Datei auch direkt im LXC herunterladen und anschließend starten:

```sh
curl --fail --location --output retourenboard-install.sh https://raw.githubusercontent.com/AS0020/retourenboard/main/retourenboard-install.sh
bash retourenboard-install.sh
```

Falls `curl` fehlt: als `root` zuerst `apt update && apt install -y curl` ausführen. Für die Installation ebenfalls `root` verwenden oder `sudo bash retourenboard-install.sh` starten.

1. `retourenboard-install.sh` beispielsweise mit WinSCP auf den LXC/Server kopieren, etwa nach `/root/`.
2. In der LXC-Konsole als `root` ausführen:

   ```sh
   bash /root/retourenboard-install.sh
   ```

   Mit einem normalen Linux-Konto: `sudo bash retourenboard-install.sh`.

3. Die am Ende angezeigte Adresse `http://LXC-IP:3000` im Browser öffnen und den ersten Administrator anlegen.

Die Datei enthält die gesamte Anwendung, prüft die SHA256-Prüfsumme ihres eingebetteten Archivs und entpackt sich automatisch. Sie installiert Node.js und richtet den automatisch startenden Dienst ein. Bei einer **neuen Installation** ist der Zugriff über die Server-/LXC-IP sofort eingerichtet; es ist kein Entpacken oder manuelles Ändern von `HOST` erforderlich. Diese Einstellung ist für das eigene Netzwerk vorgesehen; für die Veröffentlichung im Internet folgt die HTTPS-Einrichtung im nächsten Abschnitt.

Unter Proxmox bei einem unprivilegierten LXC in **Optionen → Features** „Nesting“ aktivieren und den Container neu starten, damit die systemd-Isolation des Dienstes funktionieren kann. Hintergrund: [Proxmox-Dokumentation](https://github.com/proxmox/pve-docs/blob/master/pct.adoc).

Das Installationspaket enthält ausschließlich Programmdateien. Bestehende Konten, Retouren und Anhänge vom eigenen Windows-Rechner werden nicht mitgeliefert.

Für Updates einfach die neue `retourenboard-install.sh` übertragen und denselben Befehl erneut ausführen. **Vorhandene Konten, Daten und Servereinstellungen werden erhalten.** Ein bereits auf localhost beschränkter Server bleibt daher auch nach einem Update auf localhost beschränkt; die Ausgabe zeigt den dazu passenden SSH-Tunnel an.

Alternativ aus einem vollständigen Projektordner oder dem ZIP-Paket installieren:

```sh
sudo bash scripts/install-linux.sh --lan
# Für ausschließlichen Zugriff auf localhost:
sudo bash scripts/install-linux.sh
```

Das Skript installiert Voraussetzungen über apt, lädt Node.js 24 von der offiziellen Node.js-Seite, prüft die SHA256-Prüfsumme, legt einen Dienstbenutzer an und startet die Anwendung als systemd-Dienst. Das Skript unter `scripts/` benötigt den vollständigen Projektordner; die einzelne `retourenboard-install.sh` enthält ihn bereits.

| Pfad | Inhalt |
| --- | --- |
| `/opt/retourenverwaltung/current` | Aktuelle Programmversion |
| `/opt/retourenverwaltung/releases` | Installierte Versionen |
| `/var/lib/retourenverwaltung/retouren.sqlite` | Gemeinsame Daten und persönliche Konten |
| `/var/lib/retourenverwaltung/attachments/` | Geschützte Dateianhänge |
| `/etc/retourenverwaltung.env` | Serverkonfiguration; nur root darf lesen |

Bei der Variante ohne `--lan` ist der Dienst nur auf dem Server unter `127.0.0.1:3000` erreichbar. Vom eigenen Rechner kann man einen Tunnel öffnen:

```sh
ssh -L 3001:127.0.0.1:3000 BENUTZER@SERVER
```

Danach lokal http://127.0.0.1:3001 öffnen und den ersten Administrator einrichten.

```sh
sudo systemctl status retourenverwaltung
sudo journalctl -u retourenverwaltung -f
sudo systemctl restart retourenverwaltung
sudo systemctl stop retourenverwaltung
```

Für Updates die neue Projektversion auf den Server kopieren und dasselbe Installationsskript erneut ausführen. Es erhält Konten, Servereinstellungen, Datenbank und Anhänge. Ein vorhandener alter Passwortwert bleibt für einen möglichen Versionsrückfall in der Linuxkonfiguration erhalten; die neue Anwendung ignoriert ihn. Alte Programmversionen werden als Rückfalloption aufbewahrt.

Die einzelne Installationsdatei nach Programmänderungen neu erstellen (Node.js und `tar` erforderlich):

```sh
node scripts/build-linux-installer.mjs
```

## Öffentlich mit Domain und HTTPS

Domain auf die Server-IP zeigen lassen und installieren:

```sh
sudo bash retourenboard-install.sh --domain retouren.example.com
# Oder aus dem vollständigen Projektordner:
sudo bash scripts/install-linux.sh --domain retouren.example.com
```

Diese Option setzt die öffentliche URL und sichere Cookies bei der **ersten Installation**. Bei einer bestehenden Installation `/etc/retourenverwaltung.env` mit `sudoedit` bearbeiten:

```ini
PUBLIC_ORIGIN=https://retouren.example.com
SECURE_COOKIES=true
NODE_ENV=production
HOST=127.0.0.1
PORT=3000
```

Anschließend einen HTTPS-Reverse-Proxy einrichten. Beispiel mit Nginx:

```sh
sudo apt-get install nginx certbot python3-certbot-nginx
```

Datei `/etc/nginx/sites-available/retourenverwaltung` anlegen; die Domain ersetzen:

```nginx
server {
    listen 80;
    server_name retouren.example.com;
    client_max_body_size 11m;
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

```sh
sudo ln -s /etc/nginx/sites-available/retourenverwaltung /etc/nginx/sites-enabled/retourenverwaltung
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d retouren.example.com --redirect
sudo systemctl restart retourenverwaltung
```

Ports 80 und 443 müssen erreichbar sein. Port 3000 bleibt auf localhost gebunden. Der Server prüft Schreibanfragen gegen `PUBLIC_ORIGIN`; diese muss exakt der verwendeten HTTPS-Adresse entsprechen. Das Installationsskript richtet DNS und Zertifikate nicht selbst ein.

## CSV importieren

1. Lieferanten, Hersteller, Kategorien und Retourenoptionen zuerst im Adminbereich anlegen; die Namen aus der CSV müssen dort vorhanden sein. Für den Import mit einem persönlichen Konto anmelden.
2. „CSV importieren“ wählen; Produkte oder Retouren auswählen.
3. CSV-Datei auswählen oder CSV-Text einfügen.
4. Spalten den Feldern zuordnen. Artikelnummer und Produktname sind bei Produkten Pflicht; bei Retouren Artikelnummer und Eingangsdatum.
5. „Vorschau prüfen“ drücken, Fehler korrigieren und importieren.

CSV verwendet UTF-8, Komma oder Semikolon; Zitate und mehrzeilige Felder werden unterstützt. Maximal 2 MB und 10.000 Datenzeilen pro Import. Preise als `29,95` oder `29.95`, Datum als `YYYY-MM-DD`. EAN und Seriennummer werden als Text gespeichert. EAN kann leer sein oder 8, 12, 13 oder 14 Ziffern enthalten.

Produkte werden anhand ihrer Artikelnummer zugeordnet. Vorhandene Produkte werden nur mit aktivierter Update-Option geändert; nicht zugeordnete Felder bleiben bei Updates erhalten. Retouren verlangen bereits vorhandene aktive Produkte. Eine vorhandene Retourennummer darf nicht doppelt vorkommen. Ohne Retourennummer wird automatisch eine vergeben; wiederholter Import solcher Zeilen erzeugt neue Retouren. Für wiederholbare Importe eigene eindeutige Retourennummern mitliefern.

Die Retouren-CSV enthält eine optionale Spalte „Lieferant“. Ohne zugeordnete Lieferantenspalte wird ein aktiver Produktlieferant übernommen; eine zugeordnete leere Zelle bedeutet „Keine Zuordnung“. Unbekannte oder neu zugeordnete archivierte Stammdaten erscheinen als Fehler in der Vorschau. Eigene Statusnamen werden unterstützt.

Fehler verhindern den gesamten Import. Vor dem Speichern wird erneut geprüft; alle Zeilen werden in einer Transaktion gespeichert. CSV-Vorlagen sind im Importdialog erhältlich. CSV-Exporte enthalten den kompletten Bestand einschließlich archivierter Produkte und werden für Tabellenprogramme vor Formelinterpretation geschützt. Zellen mit Formelzeichen erhalten dafür ein führendes Apostroph; dieses wird beim Wiedereinlesen nicht entfernt. In Excel EAN/Artikelnummern/Seriennummern beim CSV-Öffnen ausdrücklich als Text behandeln.

## Passwort ändern und Daten sichern

Oben auf deinen Namen klicken und unter **Mein Konto** das aktuelle und ein neues Passwort eingeben. Alle bisherigen Sitzungen dieses Kontos werden dadurch ungültig. Administratoren können unter **Adminbereich → Benutzerkonten** ein neues Passwort für ein Konto setzen. Dieses anschließend der betroffenen Person sicher mitteilen.

Für eine konsistente einfache Sicherung unter Linux den Dienst kurz stoppen:

```sh
sudo systemctl stop retourenverwaltung
sudo tar -czf "retouren-backup-$(date +%F-%H%M%S).tar.gz" -C /var/lib/retourenverwaltung .
sudo chmod 600 retouren-backup-*.tar.gz
sudo systemctl start retourenverwaltung
```

Das komplette Datenverzeichnis sichern, einschließlich `attachments/` und eventuell vorhandenen SQLite-WAL-Dateien. Backups vor einem größeren Update separat aufbewahren. Wiederherstellung: Dienst stoppen, Sicherung in das Datenverzeichnis entpacken, Eigentümer auf `retourenverwaltung:retourenverwaltung` setzen und Dienst starten. Backups enthalten Bestandsdaten, Konten und Passwort-Hashes und müssen geschützt aufbewahrt werden. Die Serverkonfiguration separat sichern.

## Docker als Alternative

```sh
docker build -t ruecklauf .
docker volume create ruecklauf-data
docker run -d --name ruecklauf --restart unless-stopped -p 127.0.0.1:3000:3000 \
  --env-file .env -e HOST=0.0.0.0 -e DB_PATH=/data/retouren.sqlite \
  -v ruecklauf-data:/data ruecklauf
```

Für öffentlichen Betrieb die HTTPS-Konfiguration wie oben setzen und einen Reverse Proxy verwenden.

## Hinweise zum Betrieb

Alle Bestandsdaten, einschließlich Bestell- und Seriennummern, Notizen und Dateianhängen, sind ausschließlich nach Anmeldung sichtbar. Jeder aktive Account sieht denselben Bestand. Mitarbeiter und Administratoren bearbeiten denselben Bestand; Stammdaten und Konten sind Administratoraufgaben. Eine individuelle Änderungshistorie ist nicht enthalten. Die App lädt Änderungen bei geöffnetem Tab etwa alle 30 Sekunden neu.

Das Login begrenzt Fehlversuche auf zehn pro 15 Minuten und Quell-IP. Hinter einem Reverse Proxy gilt dessen IP; dies ist bewusst konservativ. Der Dienst hält Sessions und Fehlversuche im Arbeitsspeicher, ein Neustart setzt sie zurück. SQLite ist für eine einzelne Serverinstanz mit persistentem Speicher vorgesehen. Native `node:sqlite`-APIs können in Node.js 22 noch eine ExperimentalWarning ausgeben.

Die automatisierten Tests und Browserabläufe werden unter Windows geprüft. Die Linux-Skripte erhalten Bash-Syntaxprüfungen und isolierte Tests für Konfiguration, Adressausgabe, Entpackung, beschädigte Archive und Dienst-Rückfall. Eine tatsächliche apt-/systemd-Installation benötigt einen Linux-Server. Docker-Image und HTTPS-Zertifikat werden lokal unter Windows nicht ausgerollt.
