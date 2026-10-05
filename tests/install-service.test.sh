#!/usr/bin/env bash
set -euo pipefail
source scripts/start-service.sh

# Simulate systemd failures without touching services or filesystem paths.
events=''
attempts=0
mode='restart-failure'
systemctl() {
  events+="systemctl $*;"
  if [[ $1 == restart ]]; then
    attempts=$((attempts+1))
    if [[ $mode == restart-failure && $attempts -eq 1 ]]; then return 1; fi
    return 0
  fi
  [[ $mode == success ]]
}
ln() { events+="ln $*;"; }
sleep() { :; }
journalctl() { :; }

if start_service_or_restore app.service /opt/test /old/release /old/runtime; then
  echo 'FAIL: failed restart must report failure' >&2; exit 1
fi
[[ $events == *'ln -sfn -- /old/release /opt/test/current;'* ]]
[[ $events == *'ln -sfn -- /old/runtime /opt/test/node;'* ]]
[[ $attempts -eq 2 ]]

events=''; attempts=0; mode='inactive'
if start_service_or_restore app.service /opt/test /old/release /old/runtime; then
  echo 'FAIL: inactive new service must report failure' >&2; exit 1
fi
[[ $attempts -eq 2 ]]

events=''; attempts=0; mode='success'
start_service_or_restore app.service /opt/test /old/release /old/runtime
[[ $attempts -eq 1 && $events != *'ln '* ]]
echo 'PASS: restart failure and inactive service both restore the previous version; successful start keeps the new version.'
