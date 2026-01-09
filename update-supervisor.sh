#!/bin/bash
set -euo pipefail

# Configuration - override via environment variables
REPO_URL="${CLAUDETRACKER_REPO_URL:-git@github.com:YOUR_USER/claudetracker-data.git}"
WORK_DIR="/tmp/claudetracker-data"
SSH_KEY="${CLAUDETRACKER_SSH_KEY:-/run/secrets/deploy_key}"

echo "=== Claude Tracker Update: $(date -u +%Y-%m-%d-%H%M%S) ==="

# Configure SSH
export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=/dev/null"

# Clone fresh
echo "Cloning $REPO_URL..."
git clone "$REPO_URL" "$WORK_DIR"
cd "$WORK_DIR"

# Update Claude Code
echo "Updating Claude Code..."
if command -v claude &> /dev/null; then
    claude update || npm update -g @anthropic-ai/claude-code
else
    npm update -g @anthropic-ai/claude-code
fi

# Copy tracked files into repo
echo "Copying tracked files..."
mkdir -p "$WORK_DIR/npm-global"
rsync -a --delete /home/node/.npm-global/ "$WORK_DIR/npm-global/"

# Remove .claude/ if it exists (no longer tracked - too noisy)
rm -rf "$WORK_DIR/.claude"

# Prettify JS files one by one (prettier ignores node_modules by default)
echo "Prettifying JS files..."
find "$WORK_DIR/npm-global" -name "*.js" -type f | while read -r jsfile; do
    echo "  Formatting: $jsfile"
    # Copy to temp, format, copy back (avoids prettier's node_modules ignore)
    cp "$jsfile" /tmp/format.js
    if prettier --write /tmp/format.js > /dev/null 2>&1; then
        cp /tmp/format.js "$jsfile"
    else
        echo "  Warning: prettier failed on $jsfile"
    fi
done

# Run fingerprint analysis on the main CLI
CLI_JS="$WORK_DIR/npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js"
if [ -f "$CLI_JS" ]; then
    echo "Running fingerprint analysis..."
    REPORT_DIR="$WORK_DIR/fingerprints"
    mkdir -p "$REPORT_DIR"

    # Generate fingerprint report
    node /home/node/tracker/dist/cli/fingerprint.js "$CLI_JS" --with-anchors --json > "$REPORT_DIR/latest.json" 2>/dev/null || true

    # Generate summary
    node -e "
const data = require('$REPORT_DIR/latest.json');
const named = data.filter(f => f.inferredName);
const summary = {
  timestamp: new Date().toISOString(),
  totalFunctions: data.length,
  autoNamed: named.length,
  autoNamedPercent: ((named.length / data.length) * 100).toFixed(1),
  samples: named.slice(0, 20).map(f => ({
    minified: f.name,
    inferred: f.inferredName,
    confidence: (f.confidence * 100).toFixed(0) + '%',
    anchors: f.fingerprint.anchors.slice(0, 2)
  }))
};
console.log(JSON.stringify(summary, null, 2));
" > "$REPORT_DIR/summary.json" 2>/dev/null || echo "Summary generation failed"

    echo "Fingerprint analysis complete"
fi

# Commit and push if changes
git add -A
if ! git diff --cached --quiet; then
    echo "Changes detected, committing..."
    git -c user.name="Claude Tracker" -c user.email="tracker@localhost" \
        commit -m "Update $(date -u +%Y-%m-%d-%H%M)"
    git push
    echo "Changes pushed successfully"
else
    echo "No changes detected"
fi

echo "=== Done ==="
