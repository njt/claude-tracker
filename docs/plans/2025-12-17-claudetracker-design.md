# Claude Code Evolution Tracker - Design

Track Claude Code's evolution over time by capturing and diffing prettified source files after each update.

## Overview

Two repositories:

1. **claudetracker-infra** - Dockerfile, scripts, documentation
2. **claudetracker-data** - Tracked files only (commit history = Claude evolution)

An ephemeral container runs hourly via cron. Each run clones the data repo, updates Claude Code, prettifies JS files, and pushes any changes.

## Repository Structure

### claudetracker-infra

```
claudetracker/
├── Dockerfile
├── update-supervisor.sh
├── README.md
└── docs/plans/
```

### claudetracker-data

```
claudetracker-data/
├── .claude/           # Claude config directory
├── npm-global/        # Prettified npm global install
└── .gitignore
```

## Container Design

**Base image:** `node:20-slim`

**Installed tools:**
- git, openssh-client (for clone/push)
- prettier (for consistent JS formatting)
- @anthropic-ai/claude-code

**Environment:**
- `NPM_CONFIG_PREFIX=/home/node/.npm-global`
- Non-root user (`node`)

**Entrypoint:** `update-supervisor.sh`

## Update Flow

```
Host cron (hourly)
  → podman run claudetracker
    → clone claudetracker-data via SSH
    → claude update
    → rsync .npm-global/ and .claude/ into repo
    → prettier --write on all JS files
    → git commit/push (if changes)
    → container exits
```

## Authentication

- SSH deploy key scoped to claudetracker-data repo
- Key stored on host at `~/.ssh/claudetracker_key`
- Mounted into container at `/run/secrets/deploy_key` (read-only)
- Not visible in `ps` output (file mount, not env var)

## Formatting Strategy

Prettier reformats minified JS with consistent whitespace and indentation. Variable names stay minified (a, b, c) but structure becomes diffable.

No semantic restoration attempted - consistent formatting across runs is sufficient for meaningful diffs.

## Dockerfile

```dockerfile
FROM node:20-slim

RUN apt-get update && apt-get install -y \
    git \
    openssh-client \
    && rm -rf /var/lib/apt/lists/* \
    && npm install -g prettier

ENV NPM_CONFIG_PREFIX=/home/node/.npm-global
ENV PATH="/home/node/.npm-global/bin:$PATH"

RUN npm install -g @anthropic-ai/claude-code

COPY update-supervisor.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/update-supervisor.sh

USER node
WORKDIR /home/node

ENTRYPOINT ["/usr/local/bin/update-supervisor.sh"]
```

## update-supervisor.sh

```bash
#!/bin/bash
set -euo pipefail

REPO_URL="git@github.com:YOUR_USER/claudetracker-data.git"
WORK_DIR="/tmp/claudetracker-data"
SSH_KEY="/run/secrets/deploy_key"

export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new"

git clone "$REPO_URL" "$WORK_DIR"
cd "$WORK_DIR"

claude update || npm update -g @anthropic-ai/claude-code

rsync -a --delete /home/node/.npm-global/ "$WORK_DIR/npm-global/"
rsync -a --delete /home/node/.claude/ "$WORK_DIR/.claude/" 2>/dev/null || true

find "$WORK_DIR/npm-global" -name "*.js" -exec prettier --write {} + 2>/dev/null || true

git add -A
if ! git diff --cached --quiet; then
    git -c user.name="Claude Tracker" -c user.email="tracker@localhost" \
        commit -m "Update $(date -u +%Y-%m-%d-%H%M)"
    git push
    echo "Changes pushed"
else
    echo "No changes"
fi
```

## Host Setup

### Generate deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/claudetracker_key -N ""
chmod 600 ~/.ssh/claudetracker_key
```

Add `~/.ssh/claudetracker_key.pub` to GitHub repo as deploy key with write access.

### Build container

```bash
podman build -t claudetracker:latest .
```

### Test run

```bash
podman run --rm \
    -v ~/.ssh/claudetracker_key:/run/secrets/deploy_key:ro \
    claudetracker:latest
```

### Install cron (hourly)

```bash
crontab -e
```

Add:
```
0 * * * * podman run --rm -v /home/USER/.ssh/claudetracker_key:/run/secrets/deploy_key:ro claudetracker:latest >> /var/log/claudetracker.log 2>&1
```

## Initial Bootstrap

1. Create both GitHub repos
2. Generate and configure deploy key
3. Build container image
4. Run once manually to establish baseline commit
5. Install cron for hourly runs

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Formatting | Prettier only | Semantic restoration risks inconsistent diffs |
| Persistence | GitHub (clone each run) | No local state, portable, single source of truth |
| Auth | SSH deploy key | No expiration, repo-scoped, file-mounted |
| Repos | Two (infra + data) | Data repo history is purely Claude changes |
| Scheduling | Host cron | Portable across WSL, Linux, cloud |
| Base image | node:20-slim | Balance of size and compatibility |
| Tracked files | npm-global + .claude | Code changes + config schema evolution |
