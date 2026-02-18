#!/usr/bin/env bash
# ClawDock - Docker helpers for OpenWolf
# Inspired by Simon Willison's "Running OpenWolf in Docker"
# https://til.simonwillison.net/llms/openwolf-docker
#
# Installation:
#   mkdir -p ~/.wolfdock && curl -sL https://raw.githubusercontent.com/openwolf/openwolf/main/scripts/shell-helpers/wolfdock-helpers.sh -o ~/.wolfdock/wolfdock-helpers.sh
#   echo 'source ~/.wolfdock/wolfdock-helpers.sh' >> ~/.zshrc
#
# Usage:
#   wolfdock-help    # Show all available commands

# =============================================================================
# Colors
# =============================================================================
_CLR_RESET='\033[0m'
_CLR_BOLD='\033[1m'
_CLR_DIM='\033[2m'
_CLR_GREEN='\033[0;32m'
_CLR_YELLOW='\033[1;33m'
_CLR_BLUE='\033[0;34m'
_CLR_MAGENTA='\033[0;35m'
_CLR_CYAN='\033[0;36m'
_CLR_RED='\033[0;31m'

# Styled command output (green + bold)
_clr_cmd() {
  echo -e "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# Inline command for use in sentences
_cmd() {
  echo "${_CLR_GREEN}${_CLR_BOLD}$1${_CLR_RESET}"
}

# =============================================================================
# Config
# =============================================================================
WOLFDOCK_CONFIG="${HOME}/.wolfdock/config"

# Common paths to check for OpenWolf
WOLFDOCK_COMMON_PATHS=(
  "${HOME}/openwolf"
  "${HOME}/workspace/openwolf"
  "${HOME}/projects/openwolf"
  "${HOME}/dev/openwolf"
  "${HOME}/code/openwolf"
  "${HOME}/src/openwolf"
)

_wolfdock_filter_warnings() {
  grep -v "^WARN\|^time="
}

_wolfdock_trim_quotes() {
  local value="$1"
  value="${value#\"}"
  value="${value%\"}"
  printf "%s" "$value"
}

_wolfdock_read_config_dir() {
  if [[ ! -f "$WOLFDOCK_CONFIG" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^WOLFDOCK_DIR=//p' "$WOLFDOCK_CONFIG" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _wolfdock_trim_quotes "$raw"
}

# Ensure WOLFDOCK_DIR is set and valid
_wolfdock_ensure_dir() {
  # Already set and valid?
  if [[ -n "$WOLFDOCK_DIR" && -f "${WOLFDOCK_DIR}/docker-compose.yml" ]]; then
    return 0
  fi

  # Try loading from config
  local config_dir
  config_dir=$(_wolfdock_read_config_dir)
  if [[ -n "$config_dir" && -f "${config_dir}/docker-compose.yml" ]]; then
    WOLFDOCK_DIR="$config_dir"
    return 0
  fi

  # Auto-detect from common paths
  local found_path=""
  for path in "${WOLFDOCK_COMMON_PATHS[@]}"; do
    if [[ -f "${path}/docker-compose.yml" ]]; then
      found_path="$path"
      break
    fi
  done

  if [[ -n "$found_path" ]]; then
    echo ""
    echo "🦞 Found OpenWolf at: $found_path"
    echo -n "   Use this location? [Y/n] "
    read -r response
    if [[ "$response" =~ ^[Nn] ]]; then
      echo ""
      echo "Set WOLFDOCK_DIR manually:"
      echo "  export WOLFDOCK_DIR=/path/to/openwolf"
      return 1
    fi
    WOLFDOCK_DIR="$found_path"
  else
    echo ""
    echo "❌ OpenWolf not found in common locations."
    echo ""
    echo "Clone it first:"
    echo ""
    echo "  git clone https://github.com/openwolf/openwolf.git ~/openwolf"
    echo "  cd ~/openwolf && ./docker-setup.sh"
    echo ""
    echo "Or set WOLFDOCK_DIR if it's elsewhere:"
    echo ""
    echo "  export WOLFDOCK_DIR=/path/to/openwolf"
    echo ""
    return 1
  fi

  # Save to config
  if [[ ! -d "${HOME}/.wolfdock" ]]; then
    /bin/mkdir -p "${HOME}/.wolfdock"
  fi
  echo "WOLFDOCK_DIR=\"$WOLFDOCK_DIR\"" > "$WOLFDOCK_CONFIG"
  echo "✅ Saved to $WOLFDOCK_CONFIG"
  echo ""
  return 0
}

# Wrapper to run docker compose commands
_wolfdock_compose() {
  _wolfdock_ensure_dir || return 1
  command docker compose -f "${WOLFDOCK_DIR}/docker-compose.yml" "$@"
}

_wolfdock_read_env_token() {
  _wolfdock_ensure_dir || return 1
  if [[ ! -f "${WOLFDOCK_DIR}/.env" ]]; then
    return 1
  fi
  local raw
  raw=$(sed -n 's/^OPENWOLF_GATEWAY_TOKEN=//p' "${WOLFDOCK_DIR}/.env" | head -n 1)
  if [[ -z "$raw" ]]; then
    return 1
  fi
  _wolfdock_trim_quotes "$raw"
}

# Basic Operations
wolfdock-start() {
  _wolfdock_compose up -d openwolf-gateway
}

wolfdock-stop() {
  _wolfdock_compose down
}

wolfdock-restart() {
  _wolfdock_compose restart openwolf-gateway
}

wolfdock-logs() {
  _wolfdock_compose logs -f openwolf-gateway
}

wolfdock-status() {
  _wolfdock_compose ps
}

# Navigation
wolfdock-cd() {
  _wolfdock_ensure_dir || return 1
  cd "${WOLFDOCK_DIR}"
}

wolfdock-config() {
  cd ~/.openwolf
}

wolfdock-workspace() {
  cd ~/.openwolf/workspace
}

# Container Access
wolfdock-shell() {
  _wolfdock_compose exec openwolf-gateway \
    bash -c 'echo "alias openwolf=\"./openwolf.mjs\"" > /tmp/.bashrc_openwolf && bash --rcfile /tmp/.bashrc_openwolf'
}

wolfdock-exec() {
  _wolfdock_compose exec openwolf-gateway "$@"
}

wolfdock-cli() {
  _wolfdock_compose run --rm openwolf-cli "$@"
}

# Maintenance
wolfdock-rebuild() {
  _wolfdock_compose build openwolf-gateway
}

wolfdock-clean() {
  _wolfdock_compose down -v --remove-orphans
}

# Health check
wolfdock-health() {
  _wolfdock_ensure_dir || return 1
  local token
  token=$(_wolfdock_read_env_token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${WOLFDOCK_DIR}/.env"
    return 1
  fi
  _wolfdock_compose exec -e "OPENWOLF_GATEWAY_TOKEN=$token" openwolf-gateway \
    node dist/index.js health
}

# Show gateway token
wolfdock-token() {
  _wolfdock_read_env_token
}

# Fix token configuration (run this once after setup)
wolfdock-fix-token() {
  _wolfdock_ensure_dir || return 1

  echo "🔧 Configuring gateway token..."
  local token
  token=$(wolfdock-token)
  if [[ -z "$token" ]]; then
    echo "❌ Error: Could not find gateway token"
    echo "   Check: ${WOLFDOCK_DIR}/.env"
    return 1
  fi

  echo "📝 Setting token: ${token:0:20}..."

  _wolfdock_compose exec -e "TOKEN=$token" openwolf-gateway \
    bash -c './openwolf.mjs config set gateway.remote.token "$TOKEN" && ./openwolf.mjs config set gateway.auth.token "$TOKEN"' 2>&1 | _wolfdock_filter_warnings

  echo "🔍 Verifying token was saved..."
  local saved_token
  saved_token=$(_wolfdock_compose exec openwolf-gateway \
    bash -c "./openwolf.mjs config get gateway.remote.token 2>/dev/null" 2>&1 | _wolfdock_filter_warnings | tr -d '\r\n' | head -c 64)

  if [[ "$saved_token" == "$token" ]]; then
    echo "✅ Token saved correctly!"
  else
    echo "⚠️  Token mismatch detected"
    echo "   Expected: ${token:0:20}..."
    echo "   Got: ${saved_token:0:20}..."
  fi

  echo "🔄 Restarting gateway..."
  _wolfdock_compose restart openwolf-gateway 2>&1 | _wolfdock_filter_warnings

  echo "⏳ Waiting for gateway to start..."
  sleep 5

  echo "✅ Configuration complete!"
  echo -e "   Try: $(_cmd wolfdock-devices)"
}

# Open dashboard in browser
wolfdock-dashboard() {
  _wolfdock_ensure_dir || return 1

  echo "🦞 Getting dashboard URL..."
  local output exit_status url
  output=$(_wolfdock_compose run --rm openwolf-cli dashboard --no-open 2>&1)
  exit_status=$?
  url=$(printf "%s\n" "$output" | _wolfdock_filter_warnings | grep -o 'http[s]\?://[^[:space:]]*' | head -n 1)
  if [[ $exit_status -ne 0 ]]; then
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd wolfdock-restart)"
    return 1
  fi

  if [[ -n "$url" ]]; then
    echo "✅ Opening: $url"
    open "$url" 2>/dev/null || xdg-open "$url" 2>/dev/null || echo "   Please open manually: $url"
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see 'pairing required' error:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd wolfdock-devices)"
    echo "   2. Copy the Request ID from the Pending table"
    echo -e "   3. Run: $(_cmd 'wolfdock-approve <request-id>')"
  else
    echo "❌ Failed to get dashboard URL"
    echo -e "   Try restarting: $(_cmd wolfdock-restart)"
  fi
}

# List device pairings
wolfdock-devices() {
  _wolfdock_ensure_dir || return 1

  echo "🔍 Checking device pairings..."
  local output exit_status
  output=$(_wolfdock_compose exec openwolf-gateway node dist/index.js devices list 2>&1)
  exit_status=$?
  printf "%s\n" "$output" | _wolfdock_filter_warnings
  if [ $exit_status -ne 0 ]; then
    echo ""
    echo -e "${_CLR_CYAN}💡 If you see token errors above:${_CLR_RESET}"
    echo -e "   1. Verify token is set: $(_cmd wolfdock-token)"
    echo "   2. Try manual config inside container:"
    echo -e "      $(_cmd wolfdock-shell)"
    echo -e "      $(_cmd 'openwolf config get gateway.remote.token')"
    return 1
  fi

  echo ""
  echo -e "${_CLR_CYAN}💡 To approve a pairing request:${_CLR_RESET}"
  echo -e "   $(_cmd 'wolfdock-approve <request-id>')"
}

# Approve device pairing request
wolfdock-approve() {
  _wolfdock_ensure_dir || return 1

  if [[ -z "$1" ]]; then
    echo -e "❌ Usage: $(_cmd 'wolfdock-approve <request-id>')"
    echo ""
    echo -e "${_CLR_CYAN}💡 How to approve a device:${_CLR_RESET}"
    echo -e "   1. Run: $(_cmd wolfdock-devices)"
    echo "   2. Find the Request ID in the Pending table (long UUID)"
    echo -e "   3. Run: $(_cmd 'wolfdock-approve <that-request-id>')"
    echo ""
    echo "Example:"
    echo -e "   $(_cmd 'wolfdock-approve 6f9db1bd-a1cc-4d3f-b643-2c195262464e')"
    return 1
  fi

  echo "✅ Approving device: $1"
  _wolfdock_compose exec openwolf-gateway \
    node dist/index.js devices approve "$1" 2>&1 | _wolfdock_filter_warnings

  echo ""
  echo "✅ Device approved! Refresh your browser."
}

# Show all available wolfdock helper commands
wolfdock-help() {
  echo -e "\n${_CLR_BOLD}${_CLR_CYAN}🦞 ClawDock - Docker Helpers for OpenWolf${_CLR_RESET}\n"

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚡ Basic Operations${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-start)       ${_CLR_DIM}Start the gateway${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-stop)        ${_CLR_DIM}Stop the gateway${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-restart)     ${_CLR_DIM}Restart the gateway${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-status)      ${_CLR_DIM}Check container status${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-logs)        ${_CLR_DIM}View live logs (follows)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🐚 Container Access${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-shell)       ${_CLR_DIM}Shell into container (openwolf alias ready)${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-cli)         ${_CLR_DIM}Run CLI commands (e.g., wolfdock-cli status)${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-exec) ${_CLR_CYAN}<cmd>${_CLR_RESET}  ${_CLR_DIM}Execute command in gateway container${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🌐 Web UI & Devices${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-dashboard)   ${_CLR_DIM}Open web UI in browser ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-devices)     ${_CLR_DIM}List device pairings ${_CLR_CYAN}(auto-guides you)${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-approve) ${_CLR_CYAN}<id>${_CLR_RESET} ${_CLR_DIM}Approve device pairing ${_CLR_CYAN}(with examples)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}⚙️  Setup & Configuration${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-fix-token)   ${_CLR_DIM}Configure gateway token ${_CLR_CYAN}(run once)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🔧 Maintenance${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-rebuild)     ${_CLR_DIM}Rebuild Docker image${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-clean)       ${_CLR_RED}⚠️  Remove containers & volumes (nuclear)${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_MAGENTA}🛠️  Utilities${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-health)      ${_CLR_DIM}Run health check${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-token)       ${_CLR_DIM}Show gateway auth token${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-cd)          ${_CLR_DIM}Jump to openwolf project directory${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-config)      ${_CLR_DIM}Open config directory (~/.openwolf)${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-workspace)   ${_CLR_DIM}Open workspace directory${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo -e "${_CLR_BOLD}${_CLR_GREEN}🚀 First Time Setup${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  1.${_CLR_RESET} $(_cmd wolfdock-start)          ${_CLR_DIM}# Start the gateway${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  2.${_CLR_RESET} $(_cmd wolfdock-fix-token)      ${_CLR_DIM}# Configure token${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  3.${_CLR_RESET} $(_cmd wolfdock-dashboard)      ${_CLR_DIM}# Open web UI${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  4.${_CLR_RESET} $(_cmd wolfdock-devices)        ${_CLR_DIM}# If pairing needed${_CLR_RESET}"
  echo -e "${_CLR_CYAN}  5.${_CLR_RESET} $(_cmd wolfdock-approve) ${_CLR_CYAN}<id>${_CLR_RESET}   ${_CLR_DIM}# Approve pairing${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_GREEN}💬 WhatsApp Setup${_CLR_RESET}"
  echo -e "  $(_cmd wolfdock-shell)"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'openwolf channels login --channel whatsapp')"
  echo -e "    ${_CLR_BLUE}>${_CLR_RESET} $(_cmd 'openwolf status')"
  echo ""

  echo -e "${_CLR_BOLD}${_CLR_CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${_CLR_RESET}"
  echo ""

  echo -e "${_CLR_CYAN}💡 All commands guide you through next steps!${_CLR_RESET}"
  echo -e "${_CLR_BLUE}📚 Docs: ${_CLR_RESET}${_CLR_CYAN}https://docs.openwolf.ai${_CLR_RESET}"
  echo ""
}
