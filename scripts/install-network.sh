#!/usr/bin/env bash

install_config_value() {
  local value
  value="$(awk -v key="$2" 'index($0, key "=") == 1 { value = substr($0, length(key) + 2) } END { sub(/\r$/, "", value); print value }' "$1")"
  # Read selected values as text; never execute an environment file.
  value="${value#\"}"; value="${value%\"}"
  value="${value#\'}"; value="${value%\'}"
  printf '%s' "$value"
}

print_install_access() {
  local config="$1" bind_host port origin server_ip address
  bind_host="$(install_config_value "$config" HOST)"
  port="$(install_config_value "$config" PORT)"
  origin="$(install_config_value "$config" PUBLIC_ORIGIN)"
  bind_host="${bind_host:-127.0.0.1}"; port="${port:-3000}"
  if [[ -n "$origin" ]]; then
    printf '\nBrowseradresse nach Einrichtung des Reverse Proxys: %s\n' "$origin"
    echo 'Siehe README.md für DNS, Nginx und HTTPS.'
    return
  fi
  case "$bind_host" in
    0.0.0.0|::)
      server_ip="$(hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/ && $i !~ /^127\./) { print $i; exit } }' || true)"
      if [[ -z "$server_ip" && "$bind_host" == :: ]]; then
        server_ip="$(hostname -I 2>/dev/null | awk '{ for (i = 1; i <= NF; i++) if ($i ~ /:/ && $i != "::1" && tolower($i) !~ /^fe80:/) { print $i; exit } }' || true)"
        if [[ -n "$server_ip" ]]; then server_ip="[$server_ip]"; fi
      fi
      printf '\nJetzt im Browser öffnen: http://%s:%s\n' "${server_ip:-LXC-IP}" "$port"
      if [[ -z "$server_ip" ]]; then echo 'LXC-IP durch die IP-Adresse deines Containers ersetzen.'; fi
      ;;
    127.0.0.1|localhost|::1)
      address="$bind_host"; if [[ "$address" == *:* ]]; then address="[$address]"; fi
      printf '\nLokal auf dem Server: http://%s:%s\n' "$address" "$port"
      printf 'Für Fernzugriff: ssh -L 3001:%s:%s BENUTZER@SERVER\n' "$address" "$port"
      echo 'Danach auf deinem Rechner http://127.0.0.1:3001 öffnen.'
      ;;
    *)
      address="$bind_host"; if [[ "$address" == *:* ]]; then address="[$address]"; fi
      printf '\nJetzt im Browser öffnen: http://%s:%s\n' "$address" "$port"
      ;;
  esac
}
