#!/bin/bash
# Validate that fingerprints persist across Claude Code versions
set -euo pipefail

DATA_REPO="/tmp/test-data"
OUTPUT_DIR="/tmp/fingerprint-validation"
TRACKER_DIR="$(cd "$(dirname "$0")/.." && pwd)"

# Versions to compare (commit hashes from data repo)
VERSIONS=(
    "a90b8c0:2.0.71"   # earliest
    "3811461:2.0.76"   # mid
    "c859f28:2.1.2"    # latest
)

mkdir -p "$OUTPUT_DIR"

echo "=== Cross-Version Fingerprint Validation ==="
echo ""

# Extract and fingerprint each version
for entry in "${VERSIONS[@]}"; do
    commit="${entry%%:*}"
    version="${entry##*:}"

    echo "Processing version $version (commit $commit)..."

    # Extract cli.js from that commit
    cli_file="$OUTPUT_DIR/cli-$version.js"
    git -C "$DATA_REPO" show "$commit:npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js" > "$cli_file" 2>/dev/null || {
        echo "  Warning: cli.js not found in $commit"
        continue
    }

    # Run fingerprinting
    output_file="$OUTPUT_DIR/fingerprints-$version.json"
    node "$TRACKER_DIR/dist/cli/fingerprint.js" "$cli_file" --with-anchors --json > "$output_file" 2>/dev/null || {
        echo "  Warning: fingerprinting failed for $version"
        continue
    }

    # Count functions with inferred names
    total=$(jq 'length' "$output_file")
    named=$(jq '[.[] | select(.inferredName != null)] | length' "$output_file")

    echo "  Version $version: $named/$total functions with inferred names"
done

echo ""
echo "=== Comparing Named Functions Across Versions ==="

# Extract named functions from each version and compare
for entry in "${VERSIONS[@]}"; do
    version="${entry##*:}"
    output_file="$OUTPUT_DIR/fingerprints-$version.json"

    if [ -f "$output_file" ]; then
        echo ""
        echo "Version $version named functions:"
        jq -r '.[] | select(.inferredName != null) | "  \(.inferredName) (\(.name)) - \(.fingerprint.anchors[0] // "no anchor" | .[0:50])"' "$output_file" | sort | head -20
    fi
done

echo ""
echo "=== Anchor Persistence Check ==="
echo "Checking if the same anchor strings appear across versions..."

# Find anchors that appear in all versions
for anchor in "CLAUDE_CONFIG_DIR" "You are Claude Code" "claude_code.active_time" "api.anthropic.com"; do
    echo ""
    echo "Anchor: '$anchor'"
    for entry in "${VERSIONS[@]}"; do
        version="${entry##*:}"
        output_file="$OUTPUT_DIR/fingerprints-$version.json"

        if [ -f "$output_file" ]; then
            count=$(jq --arg a "$anchor" '[.[] | select(.fingerprint.anchors[] | contains($a))] | length' "$output_file")
            echo "  $version: $count functions contain this anchor"
        fi
    done
done

echo ""
echo "=== Output files saved to $OUTPUT_DIR ==="
