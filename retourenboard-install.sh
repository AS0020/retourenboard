#!/usr/bin/env bash
# Generated from deploy/download-installer-header.sh and scripts/installer-actions.sh.
set -Eeuo pipefail
umask 077
repository_url='https://github.com/AS0020/retourenboard'

usage() {
  cat <<'HELP'
retourenboard. installieren, aktualisieren oder deinstallieren:
  sudo bash retourenboard-install.sh
  sudo bash retourenboard-install.sh --update
  sudo bash retourenboard-install.sh --uninstall
  sudo bash retourenboard-install.sh --uninstall --purge

Als root in der LXC-Konsole kann sudo weggelassen werden.
Installation/Update lädt die neueste GitHub-Release samt SHA256-Prüfsumme.
Die Release muss retourenverwaltung-linux.tar.gz und die dazugehörige Datei
retourenverwaltung-linux.tar.gz.sha256 enthalten. Für neue Programmversionen
muss dieser Installer nicht geändert werden. Updates erfolgen nur auf
deinen Aufruf; Konten, Daten und Servereinstellungen bleiben erhalten.

--uninstall entfernt Programm, eigene Node-Laufzeit und systemd-Dienst.
Daten und Konfiguration bleiben erhalten. --purge löscht zusätzlich die
Standarddaten nach Eingabe von LOESCHEN. Separate Backups, Daten an anderen
konfigurierten Pfaden und der Dienstbenutzer bleiben erhalten.
Deinstallation benötigt keinen Download und keine Internetverbindung.

Bei einer neuen Installation ist die Anwendung im eigenen Netzwerk über
http://LXC-IP:3000 erreichbar. Für einen vorhandenen HTTPS-Reverse-Proxy:
  sudo bash retourenboard-install.sh --domain retouren.example.com
DNS, Zertifikat und Reverse Proxy werden separat eingerichtet.
Benötigt Debian/Ubuntu mit systemd; Installation: x86_64/ARM64 und Internet.
HELP
}

#!/usr/bin/env bash
# Shared by the project installer and embedded into both standalone installers.

parse_installer_args() {
  installer_action=install
  installer_purge=false
  installer_lan=false
  installer_domain=''
  while (($#)); do
    case "$1" in
      --help|-h) usage; exit 0 ;;
      --update|--uninstall)
        local requested="${1#--}"
        if [[ $installer_action != install && $installer_action != "$requested" ]]; then
          echo '--update und --uninstall können nicht gemeinsam verwendet werden.' >&2; return 1
        fi
        installer_action="$requested"; shift ;;
      --purge) installer_purge=true; shift ;;
      --lan) installer_lan=true; shift ;;
      --domain)
        [[ $# -ge 2 ]] || { echo 'Domain fehlt.' >&2; return 1; }
        installer_domain="$2"
        if [[ ! "$installer_domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?$ || "$installer_domain" != *.* || "$installer_domain" == *..* ]]; then
          echo 'Bitte einen vollständigen Domainnamen ohne https://, Port oder Pfad angeben.' >&2; return 1
        fi
        shift 2 ;;
      *) echo "Unbekannte Option: $1" >&2; return 1 ;;
    esac
  done
  if [[ $installer_lan == true && -n $installer_domain ]]; then
    echo '--lan und --domain können nicht gemeinsam verwendet werden.' >&2; return 1
  fi
  if [[ $installer_purge == true && $installer_action != uninstall ]]; then
    echo '--purge ist nur gemeinsam mit --uninstall erlaubt.' >&2; return 1
  fi
  if [[ $installer_action == uninstall && ( $installer_lan == true || -n $installer_domain ) ]]; then
    echo 'Bei --uninstall sind --lan und --domain nicht erlaubt.' >&2; return 1
  fi
  return 0
}

require_existing_installation() {
  local prefix="${1:-}"
  if [[ ! -f "$prefix/opt/retourenverwaltung/current/package.json" || ! -f "$prefix/etc/retourenverwaltung.env" ]]; then
    echo 'Keine vollständige Installation gefunden. Für eine Installation oder Reparatur das Skript ohne --update ausführen.' >&2
    return 1
  fi
}

uninstall_retourenboard() {
  # Standalone entry points always use the fixed system paths. The internal
  # prefix parameter lets tests exercise real file operations in a fixture.
  local prefix="${1:-}" purge="${2:-false}" service=retourenverwaltung.service
  local app_dir="$prefix/opt/retourenverwaltung" data_dir="$prefix/var/lib/retourenverwaltung"
  local config="$prefix/etc/retourenverwaltung.env" unit="$prefix/etc/systemd/system/$service"
  local target confirmation load_state
  [[ $purge == false || $purge == true ]] || return 1
  for target in "$app_dir" "$unit" "$config"; do
    if [[ "$(readlink -m -- "$target")" != "$target" ]]; then
      echo "Deinstallation abgebrochen: unerwartete Pfadumleitung bei $target." >&2; return 1
    fi
  done
  if [[ $purge == true ]]; then
    if [[ "$(readlink -m -- "$data_dir")" != "$data_dir" ]]; then
      echo "Deinstallation abgebrochen: unerwartete Pfadumleitung bei $data_dir." >&2; return 1
    fi
    printf 'Dabei werden Konten, Bestand und Anhänge unter %s sowie %s dauerhaft gelöscht.\n' "$data_dir" "$config"
    echo 'Separate Backups und Daten an selbst konfigurierten anderen Pfaden bleiben erhalten.'
    printf 'Zum Bestätigen LOESCHEN eingeben: '
    if ! IFS= read -r confirmation || [[ $confirmation != LOESCHEN ]]; then
      echo 'Abgebrochen. Es wurde nichts deinstalliert oder gelöscht.' >&2; return 1
    fi
  fi
  if ! load_state="$(systemctl show --property=LoadState --value "$service")"; then
    echo 'Dienststatus konnte nicht geprüft werden. Es werden keine Dateien entfernt.' >&2; return 1
  fi
  if [[ $load_state != not-found ]]; then
    systemctl stop "$service" || { echo 'Dienst konnte nicht gestoppt werden. Es werden keine Dateien entfernt.' >&2; return 1; }
    systemctl disable "$service" || { echo 'Autostart konnte nicht deaktiviert werden. Es werden keine Dateien entfernt.' >&2; return 1; }
  fi
  rm -f -- "$unit" || { echo 'Dienstdatei konnte nicht entfernt werden. Deinstallation abgebrochen.' >&2; return 1; }
  rm -rf --one-file-system -- "$app_dir" || { echo 'Programmdateien konnten nicht vollständig entfernt werden. Daten bleiben erhalten.' >&2; return 1; }
  systemctl daemon-reload || { echo 'systemd konnte nicht neu geladen werden. Daten bleiben erhalten.' >&2; return 1; }
  systemctl reset-failed "$service" >/dev/null 2>&1 || true
  if [[ $purge == true ]]; then
    rm -rf --one-file-system -- "$data_dir" || { echo 'Daten konnten nicht vollständig entfernt werden. Konfiguration bleibt erhalten.' >&2; return 1; }
    rm -f -- "$config" || { echo 'Konfiguration konnte nicht entfernt werden.' >&2; return 1; }
    echo 'retourenboard. samt Standarddaten und Konfiguration wurde deinstalliert.'
  else
    echo 'retourenboard. wurde deinstalliert. Konten, Bestand, Anhänge und Konfiguration bleiben erhalten.'
    printf 'Daten: %s\nKonfiguration: %s\n' "$data_dir" "$config"
    echo 'Eine erneute Installation verwendet diese Daten wieder.'
  fi
}

parse_installer_args "$@"
install_args=()
if [[ -n "$installer_domain" ]]; then install_args+=(--domain "$installer_domain");
else install_args+=(--lan); fi

[[ ${EUID:-$(id -u)} -eq 0 ]] || { echo 'Bitte als root oder mit sudo ausführen.' >&2; exit 1; }
[[ $(uname -s) == Linux && -f /etc/debian_version ]] || { echo 'Unterstützt werden Debian/Ubuntu mit systemd.' >&2; exit 1; }
command -v systemctl >/dev/null && [[ -d /run/systemd/system ]] || { echo 'Ein laufendes systemd ist erforderlich.' >&2; exit 1; }
if [[ $installer_action == uninstall ]]; then uninstall_retourenboard '' "$installer_purge"; exit 0; fi
if [[ $installer_action == update ]]; then require_existing_installation; fi
for program in sha256sum mktemp cat; do
  command -v "$program" >/dev/null || { echo "Linux-Grundprogramm fehlt: $program" >&2; exit 1; }
done
if ! command -v curl >/dev/null || ! command -v tar >/dev/null || ! command -v gzip >/dev/null || [[ ! -s /etc/ssl/certs/ca-certificates.crt ]]; then
  echo 'Download-Voraussetzungen installieren …'
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl tar gzip
fi

temp_dir="$(mktemp -d)"
trap 'rm -rf -- "$temp_dir"' EXIT
# BEGIN DOWNLOAD_PACKAGE
echo 'Neueste GitHub-Release ermitteln …'
if ! release_url="$(curl --fail --silent --show-error --location --head --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 --retry 2 --output /dev/null --write-out '%{url_effective}' "$repository_url/releases/latest")"; then
  echo 'Keine aktuelle GitHub-Release erreichbar. Internetverbindung prüfen; auf GitHub muss eine Release veröffentlicht sein.' >&2; exit 1
fi
release_prefix="$repository_url/releases/tag/"
release_tag="${release_url#"$release_prefix"}"
if [[ "$release_url" != "$release_prefix"* || ! "$release_tag" =~ ^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$ ]]; then
  echo 'Die neueste Release konnte nicht eindeutig zugeordnet werden. Bitte Release-Tag prüfen (z. B. v1.0.1).' >&2; exit 1
fi
# Resolve latest once, then use the same tag for both assets even if a new
# release is published while this installer is downloading.
package_url="$repository_url/releases/download/$release_tag/retourenverwaltung-linux.tar.gz"
checksum_url="$package_url.sha256"
if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --max-time 60 --max-filesize 1024 --retry 2 --output "$temp_dir/package.sha256" "$checksum_url"; then
  echo 'Die Prüfsumme fehlt oder konnte nicht geladen werden. In derselben Release retourenverwaltung-linux.tar.gz.sha256 bereitstellen.' >&2; exit 1
fi
checksum_text="$(cat -- "$temp_dir/package.sha256")"
checksum_text="${checksum_text%$'\r'}"
if [[ "$checksum_text" =~ ^([a-fA-F0-9]{64})([[:blank:]]+\*?retourenverwaltung-linux\.tar\.gz)?$ ]]; then
  package_sha256="${BASH_REMATCH[1],,}"
else
  echo 'Die Release enthält keine gültige SHA256-Prüfsumme für das Programmpaket.' >&2; exit 1
fi
printf 'retourenboard. %s von GitHub herunterladen …\n' "$release_tag"
if ! curl --fail --silent --show-error --location --proto '=https' --proto-redir '=https' --tlsv1.2 --connect-timeout 20 --retry 2 --output "$temp_dir/package.tar.gz" "$package_url"; then
  echo 'Das Programmpaket konnte nicht heruntergeladen werden. Bitte Internetverbindung prüfen und erneut versuchen.' >&2; exit 1
fi
if ! printf '%s  %s\n' "$package_sha256" "$temp_dir/package.tar.gz" | sha256sum --check --status; then
  echo 'Das heruntergeladene Programmpaket ist beschädigt. Die Installation wurde abgebrochen.' >&2; exit 1
fi
mkdir "$temp_dir/app"
if ! tar -xzf "$temp_dir/package.tar.gz" -C "$temp_dir/app" --no-same-owner; then
  echo 'Das Programmpaket konnte nicht entpackt werden.' >&2; exit 1
fi
[[ -f "$temp_dir/app/scripts/install-linux.sh" ]] || { echo 'Im Programmpaket fehlt das Installationsskript.' >&2; exit 1; }
# END DOWNLOAD_PACKAGE
bash "$temp_dir/app/scripts/install-linux.sh" "${install_args[@]}"
