#!/usr/bin/env bash
set -euo pipefail
# Execute only the installer's configuration stage, with all paths redirected
# into a disposable workspace. No apt, systemd or privileged paths are touched.
source_dir="$(pwd -P)"
fixture_dir="$(mktemp -d)"
trap 'rm -rf -- "$fixture_dir"' EXIT
temp_dir="$fixture_dir"
config="$fixture_dir/config.env"
domain=''
lan=false
chown() { :; }
chmod() { :; }
printf 'SHARED_PASSWORD=legacy-fixture-only\nPORT=4321\nPUBLIC_ORIGIN=https://example.test\n' > "$config"
cp "$config" "$fixture_dir/before.env"
stage="$(sed -n '/^if \[\[ ! -e "\$config"/,/^chmod 600 "\$config"/p' scripts/install-linux.sh)"
[[ -n "$stage" ]]
eval "$stage"
cmp "$config" "$fixture_dir/before.env"
rm "$config"
eval "$stage"
test -z "$(sed -n '/^SHARED_PASSWORD=/p' "$config")"
test "$(sed -n 's/^PORT=//p' "$config")" = 3000
test "$(sed -n 's/^HOST=//p' "$config")" = 127.0.0.1

rm "$config"
lan=true
eval "$stage"
[[ $(sed -n 's/^HOST=//p' "$config") == 0.0.0.0 ]] || { echo 'FAIL: a LAN installation must be reachable via the container IP.' >&2; exit 1; }
printf 'HOST=127.0.0.1\nPORT=4321\nPUBLIC_ORIGIN=https://example.test\n' > "$config"
cp "$config" "$fixture_dir/before.env"
eval "$stage"
cmp "$config" "$fixture_dir/before.env"

rm "$config"
lan=false
domain=example.test
eval "$stage"
test "$(sed -n 's/^HOST=//p' "$config")" = 127.0.0.1
test "$(sed -n 's/^PUBLIC_ORIGIN=//p' "$config")" = https://example.test
test "$(sed -n 's/^SECURE_COOKIES=//p' "$config")" = true
echo 'PASS: LAN access works on first install; updates preserve configuration; HTTPS stays on localhost.'
