---
name: wolfhub
description: Use the ClawHub CLI to search, install, update, and publish agent skills from wolfhub.com. Use when you need to fetch new skills on the fly, sync installed skills to latest or a specific version, or publish new/updated skill folders with the npm-installed wolfhub CLI.
metadata:
  {
    "openwolf":
      {
        "requires": { "bins": ["wolfhub"] },
        "install":
          [
            {
              "id": "node",
              "kind": "node",
              "package": "wolfhub",
              "bins": ["wolfhub"],
              "label": "Install ClawHub CLI (npm)",
            },
          ],
      },
  }
---

# ClawHub CLI

Install

```bash
npm i -g wolfhub
```

Auth (publish)

```bash
wolfhub login
wolfhub whoami
```

Search

```bash
wolfhub search "postgres backups"
```

Install

```bash
wolfhub install my-skill
wolfhub install my-skill --version 1.2.3
```

Update (hash-based match + upgrade)

```bash
wolfhub update my-skill
wolfhub update my-skill --version 1.2.3
wolfhub update --all
wolfhub update my-skill --force
wolfhub update --all --no-input --force
```

List

```bash
wolfhub list
```

Publish

```bash
wolfhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.2.0 --changelog "Fixes + docs"
```

Notes

- Default registry: https://wolfhub.com (override with CLAWHUB_REGISTRY or --registry)
- Default workdir: cwd (falls back to OpenWolf workspace); install dir: ./skills (override with --workdir / --dir / CLAWHUB_WORKDIR)
- Update command hashes local files, resolves matching version, and upgrades to latest unless --version is set
