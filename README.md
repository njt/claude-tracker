# Claude Code Tracker

Track Claude Code's evolution over time by capturing prettified source files after each update.

## How It Works

An ephemeral container runs hourly, clones a data repo, updates Claude Code, prettifies JS files with Prettier, and pushes changes. The commit history shows exactly what changed between versions.

## Setup

### 1. Create the data repository

Create a new GitHub repo (e.g., `claudetracker-data`) to store the tracked files.

Initialize it with a README or .gitignore so it's not empty.

### 2. Generate SSH deploy key

```bash
ssh-keygen -t ed25519 -f ~/.ssh/claudetracker_key -N ""
chmod 600 ~/.ssh/claudetracker_key
```

### 3. Add deploy key to GitHub

1. Go to your `claudetracker-data` repo on GitHub
2. Settings → Deploy keys → Add deploy key
3. Paste contents of `~/.ssh/claudetracker_key.pub`
4. Check "Allow write access"
5. Add key

### 4. Build the container

```bash
# In WSL or Linux
podman build -t claudetracker:latest .
```

### 5. Configure the repo URL

Edit `update-supervisor.sh` and set `REPO_URL` to your data repo:

```bash
REPO_URL="${CLAUDETRACKER_REPO_URL:-git@github.com:YOUR_USER/claudetracker-data.git}"
```

Or pass it as an environment variable at runtime.

### 6. Test run

```bash
podman run --rm \
    -e CLAUDETRACKER_REPO_URL=git@github.com:YOUR_USER/claudetracker-data.git \
    -v ~/.ssh/claudetracker_key:/run/secrets/deploy_key:ro \
    claudetracker:latest
```

### 7. Set up cron (hourly)

```bash
crontab -e
```

Add:

```
0 * * * * podman run --rm -e CLAUDETRACKER_REPO_URL=git@github.com:YOUR_USER/claudetracker-data.git -v /home/YOUR_USER/.ssh/claudetracker_key:/run/secrets/deploy_key:ro claudetracker:latest >> /var/log/claudetracker.log 2>&1
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDETRACKER_REPO_URL` | (must set) | SSH URL of the data repository |
| `CLAUDETRACKER_SSH_KEY` | `/run/secrets/deploy_key` | Path to SSH private key inside container |

## Data Repository Structure

After first run, your data repo will contain:

```
claudetracker-data/
├── .claude/           # Claude config directory
└── npm-global/        # Prettified Claude Code package
```

## Viewing Changes

Browse commit history on GitHub, or locally:

```bash
git log --oneline
git show <commit>
git diff <old-commit> <new-commit>
```
