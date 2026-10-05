#!/usr/bin/env bash
set -euo pipefail
[[ -f scripts/install-network.sh ]] || { echo 'FAIL: the installer needs to display the actual container URL.' >&2; exit 1; }
source scripts/install-network.sh
fixture_dir="$(mktemp -d)"
trap 'rm -rf -- "$fixture_dir"' EXIT
config="$fixture_dir/config.env"
# Only the external network probe is replaced; configuration reading and URL
# selection use the same functions as the production installer.
hostname() { printf '192.168.1.42 2001:db8::42\n'; }

printf 'HOST=0.0.0.0\nPORT=4321\nPUBLIC_ORIGIN=\n' > "$config"
output="$(print_install_access "$config")"
[[ "$output" == *'http://192.168.1.42:4321'* ]]
[[ "$output" != *'ssh -L'* ]]

printf 'HOST=127.0.0.1\nPORT=4321\nPUBLIC_ORIGIN=\n' > "$config"
output="$(print_install_access "$config")"
[[ "$output" == *'http://127.0.0.1:4321'* && "$output" == *'3001:127.0.0.1:4321'* ]]

printf 'HOST=127.0.0.1\nPORT=4321\nPUBLIC_ORIGIN=https://example.test\n' > "$config"
output="$(print_install_access "$config")"
[[ "$output" == *'https://example.test'* && "$output" != *'ssh -L'* ]]

hostname() { printf '2001:db8::42\n'; }
printf 'HOST=::\nPORT=4321\nPUBLIC_ORIGIN=\n' > "$config"
[[ $(print_install_access "$config") == *'http://[2001:db8::42]:4321'* ]] || { echo 'FAIL: IPv6-only servers need a bracketed IPv6 browser address.' >&2; exit 1; }

hostname() { :; }
printf 'HOST=0.0.0.0\nPORT=3000\nPUBLIC_ORIGIN=\n' > "$config"
[[ $(print_install_access "$config") == *'http://LXC-IP:3000'* ]]
echo 'PASS: the URL uses the actual host, port and existing HTTPS configuration.'
