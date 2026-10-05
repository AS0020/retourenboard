#!/usr/bin/env bash
set -euo pipefail
bundle="${1:-retourenboard-install.sh}"
[[ -f "$bundle" ]] || { echo 'FAIL: the self-extracting installation file is missing.' >&2; exit 1; }
installer_file="$(cd -- "$(dirname -- "$bundle")" && pwd -P)/$(basename -- "$bundle")"
fixture_dir="$(mktemp -d)"
trap 'rm -rf -- "$fixture_dir"' EXIT
payload_sha256="$(sed -n "s/^payload_sha256='\([a-f0-9]*\)'$/\1/p" "$installer_file" | head -n 1)"
stage="$(sed -n '/^# BEGIN EXTRACT_BUNDLE$/,/^# END EXTRACT_BUNDLE$/p' "$installer_file")"
[[ -n "$stage" && ${#payload_sha256} -eq 64 ]]
temp_dir="$fixture_dir/good"
mkdir "$temp_dir"
# Run the exact extraction stage, including checksum verification, without
# root checks, apt, systemd, or paths outside this temporary workspace.
eval "$stage"
[[ -f "$temp_dir/app/server/users.js" && -f "$temp_dir/app/public/accounts.js" ]]
[[ ! -e "$temp_dir/app/.env" && ! -e "$temp_dir/app/data" && ! -e "$temp_dir/app/.qa" ]]

cp "$installer_file" "$fixture_dir/broken.sh"
printf 'QUFB\n' >> "$fixture_dir/broken.sh"
installer_file="$fixture_dir/broken.sh"
temp_dir="$fixture_dir/broken"
mkdir "$temp_dir"
if (eval "$stage"); then
  echo 'FAIL: a damaged package must not be extracted or installed.' >&2; exit 1
fi
[[ ! -e "$temp_dir/app" ]]
echo 'PASS: the single-file installer extracts its application and rejects a damaged download before installation.'
