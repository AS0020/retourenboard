#!/usr/bin/env bash

start_service_or_restore() {
  local service="$1" app_dir="$2" old_release="$3" old_runtime="$4"
  if systemctl restart "$service"; then
    sleep 2
    if systemctl is-active --quiet "$service"; then return 0; fi
  fi
  if [[ -n "$old_release" && -n "$old_runtime" ]]; then
    ln -sfn -- "$old_release" "$app_dir/current"
    ln -sfn -- "$old_runtime" "$app_dir/node"
    systemctl restart "$service" || true
    echo 'Die vorherige Programmversion wurde wieder aktiviert.' >&2
  fi
  journalctl -u "$service" -n 20 --no-pager >&2 || true
  return 1
}
