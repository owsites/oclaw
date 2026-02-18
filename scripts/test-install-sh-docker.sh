#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SMOKE_IMAGE="${OPENWOLF_INSTALL_SMOKE_IMAGE:-${WOLFBOT_INSTALL_SMOKE_IMAGE:-openwolf-install-smoke:local}}"
NONROOT_IMAGE="${OPENWOLF_INSTALL_NONROOT_IMAGE:-${WOLFBOT_INSTALL_NONROOT_IMAGE:-openwolf-install-nonroot:local}}"
INSTALL_URL="${OPENWOLF_INSTALL_URL:-${WOLFBOT_INSTALL_URL:-https://openwolf.bot/install.sh}}"
CLI_INSTALL_URL="${OPENWOLF_INSTALL_CLI_URL:-${WOLFBOT_INSTALL_CLI_URL:-https://openwolf.bot/install-cli.sh}}"
SKIP_NONROOT="${OPENWOLF_INSTALL_SMOKE_SKIP_NONROOT:-${WOLFBOT_INSTALL_SMOKE_SKIP_NONROOT:-0}}"
LATEST_DIR="$(mktemp -d)"
LATEST_FILE="${LATEST_DIR}/latest"

echo "==> Build smoke image (upgrade, root): $SMOKE_IMAGE"
docker build \
  -t "$SMOKE_IMAGE" \
  -f "$ROOT_DIR/scripts/docker/install-sh-smoke/Dockerfile" \
  "$ROOT_DIR/scripts/docker/install-sh-smoke"

echo "==> Run installer smoke test (root): $INSTALL_URL"
docker run --rm -t \
  -v "${LATEST_DIR}:/out" \
  -e OPENWOLF_INSTALL_URL="$INSTALL_URL" \
  -e OPENWOLF_INSTALL_LATEST_OUT="/out/latest" \
  -e OPENWOLF_INSTALL_SMOKE_PREVIOUS="${OPENWOLF_INSTALL_SMOKE_PREVIOUS:-${WOLFBOT_INSTALL_SMOKE_PREVIOUS:-}}" \
  -e OPENWOLF_INSTALL_SMOKE_SKIP_PREVIOUS="${OPENWOLF_INSTALL_SMOKE_SKIP_PREVIOUS:-${WOLFBOT_INSTALL_SMOKE_SKIP_PREVIOUS:-0}}" \
  -e OPENWOLF_NO_ONBOARD=1 \
  -e DEBIAN_FRONTEND=noninteractive \
  "$SMOKE_IMAGE"

LATEST_VERSION=""
if [[ -f "$LATEST_FILE" ]]; then
  LATEST_VERSION="$(cat "$LATEST_FILE")"
fi

if [[ "$SKIP_NONROOT" == "1" ]]; then
  echo "==> Skip non-root installer smoke (OPENWOLF_INSTALL_SMOKE_SKIP_NONROOT=1)"
else
  echo "==> Build non-root image: $NONROOT_IMAGE"
  docker build \
    -t "$NONROOT_IMAGE" \
    -f "$ROOT_DIR/scripts/docker/install-sh-nonroot/Dockerfile" \
    "$ROOT_DIR/scripts/docker/install-sh-nonroot"

  echo "==> Run installer non-root test: $INSTALL_URL"
  docker run --rm -t \
    -e OPENWOLF_INSTALL_URL="$INSTALL_URL" \
    -e OPENWOLF_INSTALL_EXPECT_VERSION="$LATEST_VERSION" \
    -e OPENWOLF_NO_ONBOARD=1 \
    -e DEBIAN_FRONTEND=noninteractive \
    "$NONROOT_IMAGE"
fi

if [[ "${OPENWOLF_INSTALL_SMOKE_SKIP_CLI:-${WOLFBOT_INSTALL_SMOKE_SKIP_CLI:-0}}" == "1" ]]; then
  echo "==> Skip CLI installer smoke (OPENWOLF_INSTALL_SMOKE_SKIP_CLI=1)"
  exit 0
fi

if [[ "$SKIP_NONROOT" == "1" ]]; then
  echo "==> Skip CLI installer smoke (non-root image skipped)"
  exit 0
fi

echo "==> Run CLI installer non-root test (same image)"
docker run --rm -t \
  --entrypoint /bin/bash \
  -e OPENWOLF_INSTALL_URL="$INSTALL_URL" \
  -e OPENWOLF_INSTALL_CLI_URL="$CLI_INSTALL_URL" \
  -e OPENWOLF_NO_ONBOARD=1 \
  -e DEBIAN_FRONTEND=noninteractive \
  "$NONROOT_IMAGE" -lc "curl -fsSL \"$CLI_INSTALL_URL\" | bash -s -- --set-npm-prefix --no-onboard"
