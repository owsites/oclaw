---
summary: "Uninstall OpenWolf completely (CLI, service, state, workspace)"
read_when:
  - You want to remove OpenWolf from a machine
  - The gateway service is still running after uninstall
title: "Uninstall"
---

# Uninstall

Two paths:

- **Easy path** if `openwolf` is still installed.
- **Manual service removal** if the CLI is gone but the service is still running.

## Easy path (CLI still installed)

Recommended: use the built-in uninstaller:

```bash
openwolf uninstall
```

Non-interactive (automation / npx):

```bash
openwolf uninstall --all --yes --non-interactive
npx -y openwolf uninstall --all --yes --non-interactive
```

Manual steps (same result):

1. Stop the gateway service:

```bash
openwolf gateway stop
```

2. Uninstall the gateway service (launchd/systemd/schtasks):

```bash
openwolf gateway uninstall
```

3. Delete state + config:

```bash
rm -rf "${OPENWOLF_STATE_DIR:-$HOME/.openwolf}"
```

If you set `OPENWOLF_CONFIG_PATH` to a custom location outside the state dir, delete that file too.

4. Delete your workspace (optional, removes agent files):

```bash
rm -rf ~/.openwolf/workspace
```

5. Remove the CLI install (pick the one you used):

```bash
npm rm -g openwolf
pnpm remove -g openwolf
bun remove -g openwolf
```

6. If you installed the macOS app:

```bash
rm -rf /Applications/OpenWolf.app
```

Notes:

- If you used profiles (`--profile` / `OPENWOLF_PROFILE`), repeat step 3 for each state dir (defaults are `~/.openwolf-<profile>`).
- In remote mode, the state dir lives on the **gateway host**, so run steps 1-4 there too.

## Manual service removal (CLI not installed)

Use this if the gateway service keeps running but `openwolf` is missing.

### macOS (launchd)

Default label is `bot.molt.gateway` (or `bot.molt.<profile>`; legacy `com.openwolf.*` may still exist):

```bash
launchctl bootout gui/$UID/bot.molt.gateway
rm -f ~/Library/LaunchAgents/bot.molt.gateway.plist
```

If you used a profile, replace the label and plist name with `bot.molt.<profile>`. Remove any legacy `com.openwolf.*` plists if present.

### Linux (systemd user unit)

Default unit name is `openwolf-gateway.service` (or `openwolf-gateway-<profile>.service`):

```bash
systemctl --user disable --now openwolf-gateway.service
rm -f ~/.config/systemd/user/openwolf-gateway.service
systemctl --user daemon-reload
```

### Windows (Scheduled Task)

Default task name is `OpenWolf Gateway` (or `OpenWolf Gateway (<profile>)`).
The task script lives under your state dir.

```powershell
schtasks /Delete /F /TN "OpenWolf Gateway"
Remove-Item -Force "$env:USERPROFILE\.openwolf\gateway.cmd"
```

If you used a profile, delete the matching task name and `~\.openwolf-<profile>\gateway.cmd`.

## Normal install vs source checkout

### Normal install (install.sh / npm / pnpm / bun)

If you used `https://openwolf.ai/install.sh` or `install.ps1`, the CLI was installed with `npm install -g openwolf@latest`.
Remove it with `npm rm -g openwolf` (or `pnpm remove -g` / `bun remove -g` if you installed that way).

### Source checkout (git clone)

If you run from a repo checkout (`git clone` + `openwolf ...` / `bun run openwolf ...`):

1. Uninstall the gateway service **before** deleting the repo (use the easy path above or manual service removal).
2. Delete the repo directory.
3. Remove state + workspace as shown above.
