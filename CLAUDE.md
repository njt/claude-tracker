# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the infrastructure repo for tracking Claude Code's evolution over time. An ephemeral container runs hourly, updates Claude Code, prettifies the JS source with Prettier, and pushes changes to a separate data repository where the commit history shows what changed between versions.

## Repository Structure

- **This repo (claudetracker)**: Infrastructure - Dockerfile, scripts
- **Data repo (claude-tracker-data)**: Tracked files only - prettified Claude Code source

## Build Commands

```bash
# Build container (requires WSL/Linux with podman)
podman build -t claudetracker:latest .

# Test run
podman run --rm --userns=keep-id \
    -e CLAUDETRACKER_REPO_URL=git@github.com:USER/claude-tracker-data.git \
    -v ~/.ssh/claudetracker_data_key:/run/secrets/deploy_key:ro \
    claudetracker:latest
```

## Key Implementation Details

**Prettier workaround**: Prettier ignores `node_modules` by default. The script works around this by copying each JS file to `/tmp`, formatting it there, then copying back. See `update-supervisor.sh` lines 39-48.

**Rootless podman**: The `--userns=keep-id` flag is required for rootless podman to preserve UID mapping so the container can read mounted SSH keys.

**SSH deploy key**: The data repo uses a dedicated SSH deploy key (not the tracker key) scoped only to that repo with write access.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `CLAUDETRACKER_REPO_URL` | SSH URL of the data repository (required) |
| `CLAUDETRACKER_SSH_KEY` | Path to SSH key inside container (default: `/run/secrets/deploy_key`) |
