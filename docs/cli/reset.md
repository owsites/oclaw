---
summary: "CLI reference for `openwolf reset` (reset local state/config)"
read_when:
  - You want to wipe local state while keeping the CLI installed
  - You want a dry-run of what would be removed
title: "reset"
---

# `openwolf reset`

Reset local config/state (keeps the CLI installed).

```bash
openwolf reset
openwolf reset --dry-run
openwolf reset --scope config+creds+sessions --yes --non-interactive
```
