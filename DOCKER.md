# Docker-Images (GitHub Container Registry)

Der Workflow [Build and publish Docker image](.github/workflows/docker-publish.yml) lädt bei der Veröffentlichung eines GitHub-Releases das Linux-Archiv und dessen SHA256-Datei herunter, prüft die Prüfsumme und die Versionsnummer in `package.json` und erstellt Images für `linux/amd64` und `linux/arm64`.

**Ersten Build starten:** Auf GitHub **Actions** → **Build and publish Docker image** → **Run workflow** → `main` auswählen → `release_tag`: `v3.2.18` → **Run workflow**.

**Nach erfolgreichem Build:**
```bash
docker pull ghcr.io/as0020/retourenboard:3.2.18
```

Das `latest`-Tag wird nur vergeben, wenn der verarbeitete Release dem aktuellsten regulären GitHub-Release entspricht. Versionierte Tags bleiben erhalten.

## Compose-Beispiel

```yaml
services:
  retourenboard:
    image: ghcr.io/as0020/retourenboard:3.2.18
    restart: unless-stopped
    ports:
      - "127.0.0.1:3000:3000"
    environment:
      HOST: "0.0.0.0"
      PORT: "3000"
      DB_PATH: "/data/retouren.sqlite"
      NODE_ENV: "production"
      SECURE_COOKIES: "true"
      PUBLIC_ORIGIN: "https://retouren.example.de"
    volumes:
      - retourenboard-data:/data
volumes:
  retourenboard-data:
```

`PUBLIC_ORIGIN` durch deine eigene HTTPS-Domain ersetzen. Der gezeigte Port ist nur am Docker-Host selbst erreichbar; ein Reverse Proxy muss die Anwendung von dort erreichen können. Für einen Reverse Proxy auf einem anderen Host eine geeignete Netz-/Firewall-Konfiguration verwenden.

**Backup:** Das gesamte Volume `retourenboard-data` sichern (SQLite und Anhänge). Vor Upgrades ein konsistentes Backup durchführen. Nicht `docker compose down -v` verwenden, sonst werden die verwalteten Volumes entfernt.

**Hinweis:** Das Docker-Image wird für Linux gebaut. Der systemd-basierte Update-Mechanismus im Adminbereich kann Container nicht selbst ersetzen; Updates erfolgen durch Wechsel des Image-Tags und Neuanlage des Containers. Falls das GHCR-Paket privat ist, muss der Docker-Host vor dem Pull mit geeigneter Berechtigung bei GHCR angemeldet werden.
