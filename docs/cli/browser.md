---
summary: "CLI reference for `openwolf browser` (profiles, tabs, actions, extension relay)"
read_when:
  - You use `openwolf browser` and want examples for common tasks
  - You want to control a browser running on another machine via a node host
  - You want to use the Chrome extension relay (attach/detach via toolbar button)
title: "browser"
---

# `openwolf browser`

Manage OpenWolf’s browser control server and run browser actions (tabs, snapshots, screenshots, navigation, clicks, typing).

Related:

- Browser tool + API: [Browser tool](/tools/browser)
- Chrome extension relay: [Chrome extension](/tools/chrome-extension)

## Common flags

- `--url <gatewayWsUrl>`: Gateway WebSocket URL (defaults to config).
- `--token <token>`: Gateway token (if required).
- `--timeout <ms>`: request timeout (ms).
- `--browser-profile <name>`: choose a browser profile (default from config).
- `--json`: machine-readable output (where supported).

## Quick start (local)

```bash
openwolf browser --browser-profile chrome tabs
openwolf browser --browser-profile openwolf start
openwolf browser --browser-profile openwolf open https://example.com
openwolf browser --browser-profile openwolf snapshot
```

## Profiles

Profiles are named browser routing configs. In practice:

- `openwolf`: launches/attaches to a dedicated OpenWolf-managed Chrome instance (isolated user data dir).
- `chrome`: controls your existing Chrome tab(s) via the Chrome extension relay.

```bash
openwolf browser profiles
openwolf browser create-profile --name work --color "#FF5A36"
openwolf browser delete-profile --name work
```

Use a specific profile:

```bash
openwolf browser --browser-profile work tabs
```

## Tabs

```bash
openwolf browser tabs
openwolf browser open https://docs.openwolf.ai
openwolf browser focus <targetId>
openwolf browser close <targetId>
```

## Snapshot / screenshot / actions

Snapshot:

```bash
openwolf browser snapshot
```

Screenshot:

```bash
openwolf browser screenshot
```

Navigate/click/type (ref-based UI automation):

```bash
openwolf browser navigate https://example.com
openwolf browser click <ref>
openwolf browser type <ref> "hello"
```

## Chrome extension relay (attach via toolbar button)

This mode lets the agent control an existing Chrome tab that you attach manually (it does not auto-attach).

Install the unpacked extension to a stable path:

```bash
openwolf browser extension install
openwolf browser extension path
```

Then Chrome → `chrome://extensions` → enable “Developer mode” → “Load unpacked” → select the printed folder.

Full guide: [Chrome extension](/tools/chrome-extension)

## Remote browser control (node host proxy)

If the Gateway runs on a different machine than the browser, run a **node host** on the machine that has Chrome/Brave/Edge/Chromium. The Gateway will proxy browser actions to that node (no separate browser control server required).

Use `gateway.nodes.browser.mode` to control auto-routing and `gateway.nodes.browser.node` to pin a specific node if multiple are connected.

Security + remote setup: [Browser tool](/tools/browser), [Remote access](/gateway/remote), [Tailscale](/gateway/tailscale), [Security](/gateway/security)
