---
summary: "CLI reference for `openwolf agents` (list/add/delete/set identity)"
read_when:
  - You want multiple isolated agents (workspaces + routing + auth)
title: "agents"
---

# `openwolf agents`

Manage isolated agents (workspaces + auth + routing).

Related:

- Multi-agent routing: [Multi-Agent Routing](/concepts/multi-agent)
- Agent workspace: [Agent workspace](/concepts/agent-workspace)

## Examples

```bash
openwolf agents list
openwolf agents add work --workspace ~/.openwolf/workspace-work
openwolf agents set-identity --workspace ~/.openwolf/workspace --from-identity
openwolf agents set-identity --agent main --avatar avatars/openwolf.png
openwolf agents delete work
```

## Identity files

Each agent workspace can include an `IDENTITY.md` at the workspace root:

- Example path: `~/.openwolf/workspace/IDENTITY.md`
- `set-identity --from-identity` reads from the workspace root (or an explicit `--identity-file`)

Avatar paths resolve relative to the workspace root.

## Set identity

`set-identity` writes fields into `agents.list[].identity`:

- `name`
- `theme`
- `emoji`
- `avatar` (workspace-relative path, http(s) URL, or data URI)

Load from `IDENTITY.md`:

```bash
openwolf agents set-identity --workspace ~/.openwolf/workspace --from-identity
```

Override fields explicitly:

```bash
openwolf agents set-identity --agent main --name "OpenWolf" --emoji "🦞" --avatar avatars/openwolf.png
```

Config sample:

```json5
{
  agents: {
    list: [
      {
        id: "main",
        identity: {
          name: "OpenWolf",
          theme: "space lobster",
          emoji: "🦞",
          avatar: "avatars/openwolf.png",
        },
      },
    ],
  },
}
```
