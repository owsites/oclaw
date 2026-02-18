---
summary: "ClawHub guide: public skills registry + CLI workflows"
read_when:
  - Introducing ClawHub to new users
  - Installing, searching, or publishing skills
  - Explaining ClawHub CLI flags and sync behavior
title: "ClawHub"
---

# ClawHub

ClawHub is the **public skill registry for OpenWolf**. It is a free service: all skills are public, open, and visible to everyone for sharing and reuse. A skill is just a folder with a `SKILL.md` file (plus supporting text files). You can browse skills in the web app or use the CLI to search, install, update, and publish skills.

Site: [wolfhub.ai](https://wolfhub.ai)

## What ClawHub is

- A public registry for OpenWolf skills.
- A versioned store of skill bundles and metadata.
- A discovery surface for search, tags, and usage signals.

## How it works

1. A user publishes a skill bundle (files + metadata).
2. ClawHub stores the bundle, parses metadata, and assigns a version.
3. The registry indexes the skill for search and discovery.
4. Users browse, download, and install skills in OpenWolf.

## What you can do

- Publish new skills and new versions of existing skills.
- Discover skills by name, tags, or search.
- Download skill bundles and inspect their files.
- Report skills that are abusive or unsafe.
- If you are a moderator, hide, unhide, delete, or ban.

## Who this is for (beginner-friendly)

If you want to add new capabilities to your OpenWolf agent, ClawHub is the easiest way to find and install skills. You do not need to know how the backend works. You can:

- Search for skills by plain language.
- Install a skill into your workspace.
- Update skills later with one command.
- Back up your own skills by publishing them.

## Quick start (non-technical)

1. Install the CLI (see next section).
2. Search for something you need:
   - `wolfhub search "calendar"`
3. Install a skill:
   - `wolfhub install <skill-slug>`
4. Start a new OpenWolf session so it picks up the new skill.

## Install the CLI

Pick one:

```bash
npm i -g wolfhub
```

```bash
pnpm add -g wolfhub
```

## How it fits into OpenWolf

By default, the CLI installs skills into `./skills` under your current working directory. If a OpenWolf workspace is configured, `wolfhub` falls back to that workspace unless you override `--workdir` (or `CLAWHUB_WORKDIR`). OpenWolf loads workspace skills from `<workspace>/skills` and will pick them up in the **next** session. If you already use `~/.openwolf/skills` or bundled skills, workspace skills take precedence.

For more detail on how skills are loaded, shared, and gated, see
[Skills](/tools/skills).

## Skill system overview

A skill is a versioned bundle of files that teaches OpenWolf how to perform a
specific task. Each publish creates a new version, and the registry keeps a
history of versions so users can audit changes.

A typical skill includes:

- A `SKILL.md` file with the primary description and usage.
- Optional configs, scripts, or supporting files used by the skill.
- Metadata such as tags, summary, and install requirements.

ClawHub uses metadata to power discovery and safely expose skill capabilities.
The registry also tracks usage signals (such as stars and downloads) to improve
ranking and visibility.

## What the service provides (features)

- **Public browsing** of skills and their `SKILL.md` content.
- **Search** powered by embeddings (vector search), not just keywords.
- **Versioning** with semver, changelogs, and tags (including `latest`).
- **Downloads** as a zip per version.
- **Stars and comments** for community feedback.
- **Moderation** hooks for approvals and audits.
- **CLI-friendly API** for automation and scripting.

## Security and moderation

ClawHub is open by default. Anyone can upload skills, but a GitHub account must
be at least one week old to publish. This helps slow down abuse without blocking
legitimate contributors.

Reporting and moderation:

- Any signed in user can report a skill.
- Report reasons are required and recorded.
- Each user can have up to 20 active reports at a time.
- Skills with more than 3 unique reports are auto hidden by default.
- Moderators can view hidden skills, unhide them, delete them, or ban users.
- Abusing the report feature can result in account bans.

Interested in becoming a moderator? Ask in the OpenWolf Discord and contact a
moderator or maintainer.

## CLI commands and parameters

Global options (apply to all commands):

- `--workdir <dir>`: Working directory (default: current dir; falls back to OpenWolf workspace).
- `--dir <dir>`: Skills directory, relative to workdir (default: `skills`).
- `--site <url>`: Site base URL (browser login).
- `--registry <url>`: Registry API base URL.
- `--no-input`: Disable prompts (non-interactive).
- `-V, --cli-version`: Print CLI version.

Auth:

- `wolfhub login` (browser flow) or `wolfhub login --token <token>`
- `wolfhub logout`
- `wolfhub whoami`

Options:

- `--token <token>`: Paste an API token.
- `--label <label>`: Label stored for browser login tokens (default: `CLI token`).
- `--no-browser`: Do not open a browser (requires `--token`).

Search:

- `wolfhub search "query"`
- `--limit <n>`: Max results.

Install:

- `wolfhub install <slug>`
- `--version <version>`: Install a specific version.
- `--force`: Overwrite if the folder already exists.

Update:

- `wolfhub update <slug>`
- `wolfhub update --all`
- `--version <version>`: Update to a specific version (single slug only).
- `--force`: Overwrite when local files do not match any published version.

List:

- `wolfhub list` (reads `.wolfhub/lock.json`)

Publish:

- `wolfhub publish <path>`
- `--slug <slug>`: Skill slug.
- `--name <name>`: Display name.
- `--version <version>`: Semver version.
- `--changelog <text>`: Changelog text (can be empty).
- `--tags <tags>`: Comma-separated tags (default: `latest`).

Delete/undelete (owner/admin only):

- `wolfhub delete <slug> --yes`
- `wolfhub undelete <slug> --yes`

Sync (scan local skills + publish new/updated):

- `wolfhub sync`
- `--root <dir...>`: Extra scan roots.
- `--all`: Upload everything without prompts.
- `--dry-run`: Show what would be uploaded.
- `--bump <type>`: `patch|minor|major` for updates (default: `patch`).
- `--changelog <text>`: Changelog for non-interactive updates.
- `--tags <tags>`: Comma-separated tags (default: `latest`).
- `--concurrency <n>`: Registry checks (default: 4).

## Common workflows for agents

### Search for skills

```bash
wolfhub search "postgres backups"
```

### Download new skills

```bash
wolfhub install my-skill-pack
```

### Update installed skills

```bash
wolfhub update --all
```

### Back up your skills (publish or sync)

For a single skill folder:

```bash
wolfhub publish ./my-skill --slug my-skill --name "My Skill" --version 1.0.0 --tags latest
```

To scan and back up many skills at once:

```bash
wolfhub sync --all
```

## Advanced details (technical)

### Versioning and tags

- Each publish creates a new **semver** `SkillVersion`.
- Tags (like `latest`) point to a version; moving tags lets you roll back.
- Changelogs are attached per version and can be empty when syncing or publishing updates.

### Local changes vs registry versions

Updates compare the local skill contents to registry versions using a content hash. If local files do not match any published version, the CLI asks before overwriting (or requires `--force` in non-interactive runs).

### Sync scanning and fallback roots

`wolfhub sync` scans your current workdir first. If no skills are found, it falls back to known legacy locations (for example `~/openwolf/skills` and `~/.openwolf/skills`). This is designed to find older skill installs without extra flags.

### Storage and lockfile

- Installed skills are recorded in `.wolfhub/lock.json` under your workdir.
- Auth tokens are stored in the ClawHub CLI config file (override via `CLAWHUB_CONFIG_PATH`).

### Telemetry (install counts)

When you run `wolfhub sync` while logged in, the CLI sends a minimal snapshot to compute install counts. You can disable this entirely:

```bash
export CLAWHUB_DISABLE_TELEMETRY=1
```

## Environment variables

- `CLAWHUB_SITE`: Override the site URL.
- `CLAWHUB_REGISTRY`: Override the registry API URL.
- `CLAWHUB_CONFIG_PATH`: Override where the CLI stores the token/config.
- `CLAWHUB_WORKDIR`: Override the default workdir.
- `CLAWHUB_DISABLE_TELEMETRY=1`: Disable telemetry on `sync`.
