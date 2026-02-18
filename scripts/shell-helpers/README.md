# ClawDock <!-- omit in toc -->

Stop typing `docker-compose` commands. Just type `wolfdock-start`.

Inspired by Simon Willison's [Running OpenWolf in Docker](https://til.simonwillison.net/llms/openwolf-docker).

- [Quickstart](#quickstart)
- [Available Commands](#available-commands)
  - [Basic Operations](#basic-operations)
  - [Container Access](#container-access)
  - [Web UI \& Devices](#web-ui--devices)
  - [Setup \& Configuration](#setup--configuration)
  - [Maintenance](#maintenance)
  - [Utilities](#utilities)
- [Common Workflows](#common-workflows)
  - [Check Status and Logs](#check-status-and-logs)
  - [Set Up WhatsApp Bot](#set-up-whatsapp-bot)
  - [Troubleshooting Device Pairing](#troubleshooting-device-pairing)
  - [Fix Token Mismatch Issues](#fix-token-mismatch-issues)
  - [Permission Denied](#permission-denied)
- [Requirements](#requirements)

## Quickstart

**Install:**

```bash
mkdir -p ~/.wolfdock && curl -sL https://raw.githubusercontent.com/openwolf/openwolf/main/scripts/shell-helpers/wolfdock-helpers.sh -o ~/.wolfdock/wolfdock-helpers.sh
```

```bash
echo 'source ~/.wolfdock/wolfdock-helpers.sh' >> ~/.zshrc && source ~/.zshrc
```

**See what you get:**

```bash
wolfdock-help
```

On first command, ClawDock auto-detects your OpenWolf directory:

- Checks common paths (`~/openwolf`, `~/workspace/openwolf`, etc.)
- If found, asks you to confirm
- Saves to `~/.wolfdock/config`

**First time setup:**

```bash
wolfdock-start
```

```bash
wolfdock-fix-token
```

```bash
wolfdock-dashboard
```

If you see "pairing required":

```bash
wolfdock-devices
```

And approve the request for the specific device:

```bash
wolfdock-approve <request-id>
```

## Available Commands

### Basic Operations

| Command            | Description                     |
| ------------------ | ------------------------------- |
| `wolfdock-start`   | Start the gateway               |
| `wolfdock-stop`    | Stop the gateway                |
| `wolfdock-restart` | Restart the gateway             |
| `wolfdock-status`  | Check container status          |
| `wolfdock-logs`    | View live logs (follows output) |

### Container Access

| Command                   | Description                                    |
| ------------------------- | ---------------------------------------------- |
| `wolfdock-shell`          | Interactive shell inside the gateway container |
| `wolfdock-cli <command>`  | Run OpenWolf CLI commands                      |
| `wolfdock-exec <command>` | Execute arbitrary commands in the container    |

### Web UI & Devices

| Command                 | Description                                |
| ----------------------- | ------------------------------------------ |
| `wolfdock-dashboard`    | Open web UI in browser with authentication |
| `wolfdock-devices`      | List device pairing requests               |
| `wolfdock-approve <id>` | Approve a device pairing request           |

### Setup & Configuration

| Command              | Description                                       |
| -------------------- | ------------------------------------------------- |
| `wolfdock-fix-token` | Configure gateway authentication token (run once) |

### Maintenance

| Command            | Description                                      |
| ------------------ | ------------------------------------------------ |
| `wolfdock-rebuild` | Rebuild the Docker image                         |
| `wolfdock-clean`   | Remove all containers and volumes (destructive!) |

### Utilities

| Command              | Description                               |
| -------------------- | ----------------------------------------- |
| `wolfdock-health`    | Run gateway health check                  |
| `wolfdock-token`     | Display the gateway authentication token  |
| `wolfdock-cd`        | Jump to the OpenWolf project directory    |
| `wolfdock-config`    | Open the OpenWolf config directory        |
| `wolfdock-workspace` | Open the workspace directory              |
| `wolfdock-help`      | Show all available commands with examples |

## Common Workflows

### Check Status and Logs

**Restart the gateway:**

```bash
wolfdock-restart
```

**Check container status:**

```bash
wolfdock-status
```

**View live logs:**

```bash
wolfdock-logs
```

### Set Up WhatsApp Bot

**Shell into the container:**

```bash
wolfdock-shell
```

**Inside the container, login to WhatsApp:**

```bash
openwolf channels login --channel whatsapp --verbose
```

Scan the QR code with WhatsApp on your phone.

**Verify connection:**

```bash
openwolf status
```

### Troubleshooting Device Pairing

**Check for pending pairing requests:**

```bash
wolfdock-devices
```

**Copy the Request ID from the "Pending" table, then approve:**

```bash
wolfdock-approve <request-id>
```

Then refresh your browser.

### Fix Token Mismatch Issues

If you see "gateway token mismatch" errors:

```bash
wolfdock-fix-token
```

This will:

1. Read the token from your `.env` file
2. Configure it in the OpenWolf config
3. Restart the gateway
4. Verify the configuration

### Permission Denied

**Ensure Docker is running and you have permission:**

```bash
docker ps
```

## Requirements

- Docker and Docker Compose installed
- Bash or Zsh shell
- OpenWolf project (from `docker-setup.sh`)

## Development

**Test with fresh config (mimics first-time install):**

```bash
unset WOLFDOCK_DIR && rm -f ~/.wolfdock/config && source scripts/shell-helpers/wolfdock-helpers.sh
```

Then run any command to trigger auto-detect:

```bash
wolfdock-start
```
