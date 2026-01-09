# AGENTS.md - Claude Code Tracker

## What This Project Does

This project tracks Claude Code's source code evolution over time. An ephemeral container runs hourly, updates Claude Code, formats the JavaScript with Prettier, and pushes changes to a separate data repository. The commit history shows exactly what changed between versions.

## Repository Architecture

Two repositories work together:

| Repository | Purpose | Location |
|------------|---------|----------|
| **claudetracker** (this repo) | Infrastructure: Dockerfile, scripts | `C:\Users\Nat\source\claudetracker` |
| **claude-tracker-data** | Tracked files: prettified Claude Code source | GitHub only (cloned fresh each run) |

The data repo contains:
- `npm-global/` - Prettified Claude Code package files

## How It Works

```
Host cron (hourly)
  → podman run claudetracker
    → clone claude-tracker-data from GitHub
    → npm update -g @anthropic-ai/claude-code
    → rsync updated files into repo
    → prettier --write on all JS files
    → git commit/push (if changes)
    → container exits (ephemeral, no state)
```

GitHub serves as persistence. Each run clones fresh, updates, commits, and pushes. No local state exists between runs.

## File Reference

| File | Purpose | Key Details |
|------|---------|-------------|
| `Dockerfile` | Container definition | node:20-slim base, installs prettier + claude-code |
| `update-supervisor.sh` | Main script | Runs inside container, lines 39-48 handle Prettier workaround |
| `README.md` | User setup instructions | Deploy key generation, cron setup |
| `docs/plans/2025-12-17-claudetracker-design.md` | Design document | Architecture decisions and rationale |
| `.gitignore` | Excludes `*.log` | |

## Build and Test

All commands run in WSL (Podman installed there).

### Build the container
```bash
podman build -t claudetracker:latest .
```

### Test run
```bash
podman run --rm --userns=keep-id \
    -e CLAUDETRACKER_REPO_URL=git@github.com:njt/claude-tracker-data.git \
    -v ~/.ssh/claudetracker_data_key:/run/secrets/deploy_key:ro \
    claudetracker:latest
```

### Production (cron)
The container runs via cron in WSL:
```
0 * * * * podman run --rm --userns=keep-id \
    -e CLAUDETRACKER_REPO_URL=git@github.com:njt/claude-tracker-data.git \
    -v /home/gnat/.ssh/claudetracker_data_key:/run/secrets/deploy_key:ro \
    claudetracker:latest >> /var/log/claudetracker.log 2>&1
```

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `CLAUDETRACKER_REPO_URL` | Yes | - | SSH URL of data repository |
| `CLAUDETRACKER_SSH_KEY` | No | `/run/secrets/deploy_key` | Path to SSH key inside container |

## Key Implementation Details

### Prettier Workaround
Prettier ignores `node_modules` by default. The script works around this by copying each JS file to `/tmp`, formatting it there, then copying back:
```bash
# update-supervisor.sh lines 39-48
find "$WORK_DIR/npm-global" -name "*.js" -type f | while read -r jsfile; do
    cp "$jsfile" /tmp/format.js
    if prettier --write /tmp/format.js > /dev/null 2>&1; then
        cp /tmp/format.js "$jsfile"
    fi
done
```

### Rootless Podman
The `--userns=keep-id` flag preserves UID mapping so the container can read mounted SSH keys with correct permissions.

### SSH Deploy Key
The data repo uses a dedicated deploy key at `~/.ssh/claudetracker_data_key` (in WSL). This key has write access only to claude-tracker-data, not the infrastructure repo.

## Common Tasks

### View container logs
```bash
wsl tail -100 /var/log/claudetracker.log
```

### Force an update run
```bash
wsl podman run --rm --userns=keep-id \
    -e CLAUDETRACKER_REPO_URL=git@github.com:njt/claude-tracker-data.git \
    -v ~/.ssh/claudetracker_data_key:/run/secrets/deploy_key:ro \
    claudetracker:latest
```

### Rebuild container after changes
```bash
wsl podman build -t claudetracker:latest /mnt/c/Users/Nat/source/claudetracker
```

### Check cron status
```bash
wsl crontab -l
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| Container can't read SSH key | Rootless podman UID mapping | Add `--userns=keep-id` |
| Prettier skips files | node_modules ignore | Already handled via /tmp copy workaround |
| Git push fails | Deploy key permissions | Verify key has write access on GitHub |
| "No changes detected" | Claude Code didn't update | Normal - means version unchanged |

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Formatting | Prettier only | Semantic restoration risks inconsistent diffs |
| Persistence | GitHub (clone each run) | No local state, portable, single source of truth |
| Auth | SSH deploy key | No expiration, repo-scoped, file-mounted |
| Repos | Two (infra + data) | Data repo history is purely Claude changes |
| Base image | node:20-slim | Balance of size and compatibility |
