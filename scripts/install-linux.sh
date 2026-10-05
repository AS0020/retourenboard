#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

usage() {
  cat <<'HELP'
retourenboard. unter Ubuntu/Debian installieren oder aktualisieren:
  sudo bash scripts/install-linux.sh
  sudo bash scripts/install-linux.sh --lan
  sudo bash scripts/install-linux.sh --domain retouren.example.com

Ohne Domain: lokaler Zugriff auf 127.0.0.1:3000 (auch via SSH-Tunnel).
Mit --lan: Zugriff im eigenen Netzwerk über die Server-/LXC-IP.
Mit Domain: HTTPS-Konfiguration für einen vorhandenen Reverse Proxy.
DNS, HTTPS-Zertifikat und Reverse Proxy werden separat eingerichtet.
Bestehende Daten, Konten und Servereinstellungen bleiben bei Updates erhalten.
HELP
}

domain=''
lan=false
while (($#)); do
  case "$1" in
    --help|-h) usage; exit 0 ;;
    --domain) [[ $# -ge 2 ]] || { echo 'Domain fehlt.' >&2; exit 1; }; domain="$2"; shift 2 ;;
    --lan) lan=true; shift ;;
    *) echo "Unbekannte Option: $1" >&2; usage; exit 1 ;;
  esac
done
if [[ "$lan" == true && -n "$domain" ]]; then
  echo '--lan und --domain können nicht gemeinsam verwendet werden.' >&2; exit 1
fi
if [[ -n "$domain" ]] && { [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ ]] || [[ "$domain" != *.* ]] || [[ "$domain" == *..* ]]; }; then
  echo 'Bitte einen vollständigen Domainnamen ohne https://, Port oder Pfad angeben.' >&2; exit 1
fi
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte mit sudo ausführen.' >&2; exit 1; }
[[ $(uname -s) == Linux && -f /etc/debian_version ]] || { echo 'Unterstützt werden Ubuntu/Debian mit systemd.' >&2; exit 1; }
command -v systemctl >/dev/null && [[ -d /run/systemd/system ]] || { echo 'Ein laufendes systemd ist erforderlich.' >&2; exit 1; }
case "$(uname -m)" in
  x86_64) arch=x64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) echo 'Unterstützt werden x86_64 und ARM64.' >&2; exit 1 ;;
esac

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
for file in package.json server/index.js server/users.js public/accounts.js deploy/retourenverwaltung.service scripts/start-service.sh scripts/install-network.sh public/vendor/pdfjs/pdf.min.mjs public/vendor/pdfjs/pdf.worker.min.mjs; do
  [[ -f "$source_dir/$file" ]] || { echo "Projektdatei fehlt: $file" >&2; exit 1; }
done
source "$source_dir/scripts/start-service.sh"
source "$source_dir/scripts/install-network.sh"
app_dir=/opt/retourenverwaltung
data_dir=/var/lib/retourenverwaltung
config=/etc/retourenverwaltung.env
service=retourenverwaltung.service
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
trap 'echo "Installation fehlgeschlagen. Vorhandene Daten liegen weiterhin unter /var/lib/retourenverwaltung. Details stehen oberhalb dieser Meldung." >&2' ERR

echo '[1/6] Voraussetzungen installieren …'
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl xz-utils tar
echo '[2/6] Offizielle Node.js-24-Laufzeit laden und Prüfsumme prüfen …'
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 'https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt' -o "$temp_dir/SHASUMS256.txt"
archive="$(awk -v arch="$arch" '$2 ~ ("^node-v24\\.[0-9]+\\.[0-9]+-linux-" arch "\\.tar\\.xz$") {print $2; exit}' "$temp_dir/SHASUMS256.txt")"
[[ "$archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-(x64|arm64)\.tar\.xz$ ]] || { echo 'Kein passendes offizielles Node.js-Paket gefunden.' >&2; exit 1; }
runtime_dir="$app_dir/${archive%.tar.xz}"
install -d -m 755 "$app_dir" "$app_dir/releases"
if [[ ! -x "$runtime_dir/bin/node" ]]; then
  curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 "https://nodejs.org/dist/latest-v24.x/$archive" -o "$temp_dir/$archive"
  awk -v file="$archive" '$2 == file {print}' "$temp_dir/SHASUMS256.txt" > "$temp_dir/checksum"
  (cd "$temp_dir" && sha256sum --check checksum)
  # Extract a verified official archive into a fresh staging directory.
  install -d -m 755 "$temp_dir/runtime"
  tar -xJf "$temp_dir/$archive" -C "$temp_dir/runtime" --strip-components=1
  "$temp_dir/runtime/bin/node" -e "if(Number(process.versions.node.split('.')[0])!==24)process.exit(1);require('node:sqlite');"
  [[ ! -e "$runtime_dir" ]] || { echo "Unvollständige Laufzeit bereits vorhanden: $runtime_dir" >&2; exit 1; }
  mv -- "$temp_dir/runtime" "$runtime_dir"
  chmod -R a+rX "$runtime_dir"
fi

echo '[3/6] Dienstbenutzer und Datenverzeichnis einrichten …'
if ! id retourenverwaltung >/dev/null 2>&1; then
  useradd --system --user-group --home-dir "$data_dir" --shell /usr/sbin/nologin retourenverwaltung
fi
install -d -m 700 -o retourenverwaltung -g retourenverwaltung "$data_dir"
if [[ ! -e "$config" ]]; then
  {
    bind_host=127.0.0.1
    if [[ "$lan" == true ]]; then bind_host=0.0.0.0; fi
    printf 'HOST=%s\nPORT=3000\nDB_PATH=/var/lib/retourenverwaltung/retouren.sqlite\n' "$bind_host"
    if [[ -n "$domain" ]]; then printf 'PUBLIC_ORIGIN=https://%s\nSECURE_COOKIES=true\nNODE_ENV=production\n' "$domain";
    else printf 'PUBLIC_ORIGIN=\nSECURE_COOKIES=false\nNODE_ENV=development\n'; fi
  } > "$config"
else
  echo 'Update: vorhandene Konten, Daten und Servereinstellungen bleiben erhalten.'
  if [[ -n "$domain" ]]; then echo 'Eine neue Domain ggf. in /etc/retourenverwaltung.env eintragen.'; fi
fi
# Vorhandene Werte bleiben als Konfiguration für einen möglichen Versionsrückfall
# erhalten. Die neue Anwendung ignoriert das frühere SHARED_PASSWORD vollständig.
chown root:root "$config"
chmod 600 "$config"

echo '[4/6] Anwendung bereitstellen …'
release_dir="$(mktemp -d "$app_dir/releases/$(date +%Y%m%d-%H%M%S)-XXXXXX")"
for dir in server shared public scripts deploy; do cp -a -- "$source_dir/$dir" "$release_dir/"; done
cp -- "$source_dir/package.json" "$source_dir/README.md" "$source_dir/.env.example" "$release_dir/"
chown -R root:root "$release_dir"
chmod -R u=rwX,go=rX "$release_dir"
"$runtime_dir/bin/node" --check "$release_dir/server/index.js"
"$runtime_dir/bin/node" --check "$release_dir/server/app.js"

echo '[5/6] Dienst installieren und starten …'
old_release="$(readlink "$app_dir/current" || true)"
old_runtime="$(readlink "$app_dir/node" || true)"
if systemctl is-active --quiet "$service"; then systemctl stop "$service"; fi
ln -sfn -- "$release_dir" "$app_dir/current"
ln -sfn -- "$runtime_dir" "$app_dir/node"
install -m 644 "$source_dir/deploy/retourenverwaltung.service" "/etc/systemd/system/$service"
systemctl daemon-reload
systemctl enable "$service"
start_service_or_restore "$service" "$app_dir" "$old_release" "$old_runtime"
echo '[6/6] Installation abgeschlossen.'
echo 'Beim ersten Browseraufruf den Administrator anlegen, bevor die Seite öffentlich freigegeben wird.'
printf '\nKonfiguration: %s\nDatenbank: %s/retouren.sqlite\n' "$config" "$data_dir"
echo 'Status: sudo systemctl status retourenverwaltung'
echo 'Logs:   sudo journalctl -u retourenverwaltung -f'
print_install_access "$config"
