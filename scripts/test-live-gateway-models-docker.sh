#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IMAGE_NAME="${OPENWOLF_IMAGE:-${WOLFBOT_IMAGE:-openwolf:local}}"
CONFIG_DIR="${OPENWOLF_CONFIG_DIR:-${WOLFBOT_CONFIG_DIR:-$HOME/.openwolf}}"
WORKSPACE_DIR="${OPENWOLF_WORKSPACE_DIR:-${WOLFBOT_WORKSPACE_DIR:-$HOME/.openwolf/workspace}}"
PROFILE_FILE="${OPENWOLF_PROFILE_FILE:-${WOLFBOT_PROFILE_FILE:-$HOME/.profile}}"

PROFILE_MOUNT=()
if [[ -f "$PROFILE_FILE" ]]; then
  PROFILE_MOUNT=(-v "$PROFILE_FILE":/home/node/.profile:ro)
fi

echo "==> Build image: $IMAGE_NAME"
docker build -t "$IMAGE_NAME" -f "$ROOT_DIR/Dockerfile" "$ROOT_DIR"

echo "==> Run gateway live model tests (profile keys)"
docker run --rm -t \
  --entrypoint bash \
  -e COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  -e HOME=/home/node \
  -e NODE_OPTIONS=--disable-warning=ExperimentalWarning \
  -e OPENWOLF_LIVE_TEST=1 \
  -e OPENWOLF_LIVE_GATEWAY_MODELS="${OPENWOLF_LIVE_GATEWAY_MODELS:-${WOLFBOT_LIVE_GATEWAY_MODELS:-all}}" \
  -e OPENWOLF_LIVE_GATEWAY_PROVIDERS="${OPENWOLF_LIVE_GATEWAY_PROVIDERS:-${WOLFBOT_LIVE_GATEWAY_PROVIDERS:-}}" \
  -e OPENWOLF_LIVE_GATEWAY_MODEL_TIMEOUT_MS="${OPENWOLF_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-${WOLFBOT_LIVE_GATEWAY_MODEL_TIMEOUT_MS:-}}" \
  -v "$CONFIG_DIR":/home/node/.openwolf \
  -v "$WORKSPACE_DIR":/home/node/.openwolf/workspace \
  "${PROFILE_MOUNT[@]}" \
  "$IMAGE_NAME" \
  -lc "set -euo pipefail; [ -f \"$HOME/.profile\" ] && source \"$HOME/.profile\" || true; cd /app && pnpm test:live"
