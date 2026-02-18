#!/usr/bin/env bash
set -euo pipefail

cd /repo

export OPENWOLF_STATE_DIR="/tmp/openwolf-test"
export OPENWOLF_CONFIG_PATH="${OPENWOLF_STATE_DIR}/openwolf.json"

echo "==> Build"
pnpm build

echo "==> Seed state"
mkdir -p "${OPENWOLF_STATE_DIR}/credentials"
mkdir -p "${OPENWOLF_STATE_DIR}/agents/main/sessions"
echo '{}' >"${OPENWOLF_CONFIG_PATH}"
echo 'creds' >"${OPENWOLF_STATE_DIR}/credentials/marker.txt"
echo 'session' >"${OPENWOLF_STATE_DIR}/agents/main/sessions/sessions.json"

echo "==> Reset (config+creds+sessions)"
pnpm openwolf reset --scope config+creds+sessions --yes --non-interactive

test ! -f "${OPENWOLF_CONFIG_PATH}"
test ! -d "${OPENWOLF_STATE_DIR}/credentials"
test ! -d "${OPENWOLF_STATE_DIR}/agents/main/sessions"

echo "==> Recreate minimal config"
mkdir -p "${OPENWOLF_STATE_DIR}/credentials"
echo '{}' >"${OPENWOLF_CONFIG_PATH}"

echo "==> Uninstall (state only)"
pnpm openwolf uninstall --state --yes --non-interactive

test ! -d "${OPENWOLF_STATE_DIR}"

echo "OK"
