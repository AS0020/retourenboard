#!/usr/bin/env bash
# Generated single-file installer. Rebuild with node scripts/build-linux-installer.mjs.
set -Eeuo pipefail
umask 077
payload_sha256='@@PAYLOAD_SHA256@@'

usage() {
  cat <<'HELP'
retourenboard. installieren oder aktualisieren:
  bash retourenboard-install.sh          (als root in der LXC-Konsole)
  sudo bash retourenboard-install.sh     (mit einem normalen Linux-Konto)

Eine Datei genügt. Das Programm wird automatisch entpackt, Node.js installiert
und der Dienst eingerichtet. Bei der ersten Installation ist die Anwendung
im eigenen Netzwerk über http://LXC-IP:3000 erreichbar. Die Adresse wird am
Ende angezeigt; den ersten Administrator anschließend im Browser anlegen.

Für einen vorhandenen HTTPS-Reverse-Proxy:
  sudo bash retourenboard-install.sh --domain retouren.example.com
DNS, Zertifikat und Reverse Proxy werden separat eingerichtet.

Updates behalten vorhandene Konten, Daten und Servereinstellungen.
Benötigt Debian/Ubuntu mit systemd, x86_64/ARM64 und Internetzugang.
HELP
}

use_lan=true
for argument in "$@"; do
  case "$argument" in
    --help|-h) usage; exit 0 ;;
    --domain) use_lan=false ;;
  esac
done
[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte als root oder mit sudo ausführen.' >&2; exit 1; }
[[ $(uname -s) == Linux && -f /etc/debian_version ]] || { echo 'Unterstützt werden Debian/Ubuntu mit systemd.' >&2; exit 1; }
command -v systemctl >/dev/null && [[ -d /run/systemd/system ]] || { echo 'Ein laufendes systemd ist erforderlich.' >&2; exit 1; }
for program in awk tail base64 sha256sum tar gzip mktemp; do
  command -v "$program" >/dev/null || { echo "Linux-Grundprogramm fehlt: $program" >&2; exit 1; }
done

installer_file="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)/$(basename -- "${BASH_SOURCE[0]}")"
temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
echo 'retourenboard. wird vorbereitet …'
# BEGIN EXTRACT_BUNDLE
payload_line="$(awk '/^__RETOURENBOARD_PAYLOAD_BELOW__$/ { print NR + 1; exit }' "$installer_file")"
[[ "$payload_line" =~ ^[0-9]+$ ]] || { echo 'Das eingebettete Programmpaket fehlt.' >&2; exit 1; }
tail -n "+$payload_line" "$installer_file" | base64 --decode > "$temp_dir/package.tar.gz"
if ! printf '%s  %s\n' "$payload_sha256" "$temp_dir/package.tar.gz" | sha256sum --check --status; then
  echo 'Die Installationsdatei ist beschädigt. Bitte erneut übertragen.' >&2; exit 1
fi
mkdir "$temp_dir/app"
tar -xzf "$temp_dir/package.tar.gz" -C "$temp_dir/app" --no-same-owner
# END EXTRACT_BUNDLE
if [[ "$use_lan" == true ]]; then
  bash "$temp_dir/app/scripts/install-linux.sh" --lan "$@"
else
  bash "$temp_dir/app/scripts/install-linux.sh" "$@"
fi
exit 0
