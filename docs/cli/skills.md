---
summary: "CLI reference for `openwolf skills` (list/info/check) and skill eligibility"
read_when:
  - You want to see which skills are available and ready to run
  - You want to debug missing binaries/env/config for skills
title: "skills"
---

# `openwolf skills`

Inspect skills (bundled + workspace + managed overrides) and see what’s eligible vs missing requirements.

Related:

- Skills system: [Skills](/tools/skills)
- Skills config: [Skills config](/tools/skills-config)
- ClawHub installs: [ClawHub](/tools/wolfhub)

## Commands

```bash
openwolf skills list
openwolf skills list --eligible
openwolf skills info <name>
openwolf skills check
```
