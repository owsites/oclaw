---
summary: "CLI reference for `openwolf config` (get/set/unset config values)"
read_when:
  - You want to read or edit config non-interactively
title: "config"
---

# `openwolf config`

Config helpers: get/set/unset values by path. Run without a subcommand to open
the configure wizard (same as `openwolf configure`).

## Examples

```bash
openwolf config get browser.executablePath
openwolf config set browser.executablePath "/usr/bin/google-chrome"
openwolf config set agents.defaults.heartbeat.every "2h"
openwolf config set agents.list[0].tools.exec.node "node-id-or-name"
openwolf config unset tools.web.search.apiKey
```

## Paths

Paths use dot or bracket notation:

```bash
openwolf config get agents.defaults.workspace
openwolf config get agents.list[0].id
```

Use the agent list index to target a specific agent:

```bash
openwolf config get agents.list
openwolf config set agents.list[1].tools.exec.node "node-id-or-name"
```

## Values

Values are parsed as JSON5 when possible; otherwise they are treated as strings.
Use `--json` to require JSON5 parsing.

```bash
openwolf config set agents.defaults.heartbeat.every "0m"
openwolf config set gateway.port 19001 --json
openwolf config set channels.whatsapp.groups '["*"]' --json
```

Restart the gateway after edits.
