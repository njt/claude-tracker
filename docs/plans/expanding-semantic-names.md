# Expanding Semantic Names for Claude Code Functions

## Overview

This plan guides the systematic expansion of semantic naming rules in the claudetracker project. The goal is to increase coverage from the current ~24 named functions to a much higher number by analyzing fingerprint data and adding high-value anchor rules to `src/anchors/rules.ts`.

## Prerequisites

Before starting, ensure you have:

1. **claudetracker repo**: `C:\Users\Nat\source\claudetracker`
2. **Data repo cloned locally**: Clone from `github.com:njt/claude-tracker-data.git`
3. **Node.js 20+** installed
4. **TypeScript built**: Run `npm run build` in the claudetracker repo

## Part 1: Understanding the Current System

### 1.1 Key Files

| File | Purpose |
|------|---------|
| `src/anchors/rules.ts` | Contains `ANCHOR_NAME_RULES` array - the main rules to expand |
| `src/anchors/extractor.ts` | Extracts stable strings/env vars from function AST nodes |
| `src/fingerprint/generator.ts` | Generates structural fingerprints including anchors |
| `src/cli/fingerprint.ts` | CLI tool to run fingerprinting on JS files |
| `scripts/validate-across-versions.sh` | Validates rules work across Claude Code versions |

### 1.2 Rule Structure

Each rule in `ANCHOR_NAME_RULES` has this structure:

```typescript
interface AnchorRule {
  pattern: string;       // String to match (exact or regex)
  isRegex: boolean;      // true if pattern is a regex
  suggestedName: string; // The semantic function name to assign
  confidence: number;    // 0-1, how confident we are (0.8-0.95 typical)
  description?: string;  // Human-readable explanation
}
```

**Matching behavior**:
- If `isRegex: false`, uses `anchor.includes(pattern)` - substring match
- If `isRegex: true`, uses `new RegExp(pattern).test(anchor)` - full regex

### 1.3 Current Categories

The existing ~24 rules cover:
- **Configuration** (2 rules): `CLAUDE_CONFIG_DIR`, `CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR`
- **Metrics** (8 rules): `claude_code.session.count`, `claude_code.lines_of_code.count`, etc.
- **API URLs** (3 rules): `https://api.anthropic.com`, OAuth endpoints
- **System prompts** (2 rules): Main prompt, agent SDK prompt
- **Model names** (2 rules): Vertex region, model identifiers

## Part 2: Pulling and Analyzing Fingerprint Data

### 2.1 Clone the Data Repository

```bash
# Clone the data repo (if not already present)
git clone git@github.com:njt/claude-tracker-data.git /tmp/claude-tracker-data

# Or if already cloned, pull latest
cd /tmp/claude-tracker-data && git pull
```

### 2.2 Locate the Fingerprint Data

The fingerprint data is generated to `fingerprints/latest.json` in the data repo. Each entry has:

```typescript
{
  name: string;              // Minified function name (e.g., "Xz")
  type: string;              // "declaration" | "expression" | "arrow"
  inferredName: string|null; // Semantic name if matched, null otherwise
  confidence: number;        // Match confidence
  fingerprint: {
    hash: string;            // SHA256 fingerprint
    minifiedName: string;    // Same as top-level name
    anchors: string[];       // IMPORTANT: Stable strings found in function
    paramCount: number;      // Number of parameters
    callSignature: string[]; // Normalized call patterns
    controlFlow: string;     // if/for/while/try patterns
    nodeCount: number;       // AST complexity
    depth: number;           // Max nesting
    location: {...}          // Line numbers
  }
}
```

### 2.3 Generate Fresh Fingerprint Data

If `fingerprints/latest.json` doesn't exist or is stale:

```bash
# Build the tracker tools
cd C:\Users\Nat\source\claudetracker
npm run build

# Find the cli.js file in the data repo
CLI_JS="/tmp/claude-tracker-data/npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js"

# Generate fingerprints with anchors
node dist/cli/fingerprint.js "$CLI_JS" --with-anchors --json > /tmp/fingerprints.json

# View summary
node dist/cli/fingerprint.js "$CLI_JS" --with-anchors 2>&1 | tail -20
```

### 2.4 Analyze Current Coverage

```bash
# Count total functions with anchors
jq 'length' /tmp/fingerprints.json

# Count functions already named
jq '[.[] | select(.inferredName != null)] | length' /tmp/fingerprints.json

# List all inferred names
jq -r '.[] | select(.inferredName != null) | "\(.inferredName): \(.name)"' /tmp/fingerprints.json | sort
```

## Part 3: Finding High-Value Anchor Candidates

### 3.1 Extract All Unique Anchors

```bash
# Get all unique anchors sorted by frequency
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | sort | uniq -c | sort -rn > /tmp/anchor-frequency.txt

# View top 50 most common anchors
head -50 /tmp/anchor-frequency.txt
```

### 3.2 Filter for Claude-Specific Patterns

Look for anchors containing these high-value indicators:

```bash
# Claude Code specific prefixes
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -i "claude" | sort | uniq -c | sort -rn

# Anthropic-related
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -i "anthropic" | sort | uniq -c | sort -rn

# Metric names (claude_code.*)
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep "^claude_code\." | sort | uniq -c | sort -rn

# Environment variables (CLAUDE_*, ANTHROPIC_*, VERTEX_*)
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -E "^(CLAUDE_|ANTHROPIC_|VERTEX_)" | sort | uniq -c | sort -rn

# API endpoints
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -E "^https?://" | sort | uniq -c | sort -rn

# Error messages (useful for exception handlers)
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -iE "(error|failed|invalid|cannot|could not)" | sort | uniq -c | sort -rn
```

### 3.3 Find Functions with Multiple Related Anchors

Functions with multiple related anchors are easier to name confidently:

```bash
# Find functions with 3+ anchors (more context = better naming)
jq -r '.[] | select(.fingerprint.anchors | length >= 3) |
  "\(.name): \(.fingerprint.anchors | join(" | "))"' /tmp/fingerprints.json

# Find unnamed functions with good anchors
jq -r '.[] | select(.inferredName == null and (.fingerprint.anchors | length >= 2)) |
  "[\(.name)] \(.fingerprint.anchors[0:3] | join(" | "))"' /tmp/fingerprints.json
```

### 3.4 Categorize Candidate Anchors

Create a working list of candidate anchors organized by category:

```bash
# Save candidates to a file for analysis
jq -r '
  .[] |
  select(.inferredName == null) |
  select(.fingerprint.anchors | length > 0) |
  .fingerprint.anchors[]
' /tmp/fingerprints.json | sort | uniq -c | sort -rn > /tmp/unnamed-anchors.txt
```

## Part 4: Identifying Function Purposes from Context

### 4.1 Analyze Anchor Context

For each promising anchor, examine the full function context:

```bash
# Find all functions containing a specific anchor
ANCHOR="your_anchor_here"
jq --arg a "$ANCHOR" '
  .[] |
  select(.fingerprint.anchors | any(contains($a))) |
  {
    name: .name,
    anchors: .fingerprint.anchors,
    paramCount: .fingerprint.paramCount,
    controlFlow: .fingerprint.controlFlow,
    callSignature: .fingerprint.callSignature[0:5],
    location: .fingerprint.location
  }
' /tmp/fingerprints.json
```

### 4.2 Naming Heuristics

Use these patterns to infer function names:

| Anchor Pattern | Likely Purpose | Name Pattern |
|---------------|----------------|--------------|
| `process.env.CLAUDE_X` | Config getter | `getClaudeX` or `isXEnabled` |
| `claude_code.X.count` | Metric counter | `getXCounter` |
| `claude_code.X.usage` | Usage metric | `getXUsageMetric` |
| `https://api.X.com/Y` | API endpoint | `getYEndpoint` or `callYApi` |
| `Error: X` / `Invalid X` | Error handler | `handleXError` or `validateX` |
| `You are X` | System prompt | `getXSystemPrompt` |
| Tool definition strings | Tool handler | `handleXTool` or `executeX` |
| Settings keys | Settings accessor | `getXSetting` or `setXSetting` |

### 4.3 Control Flow as Context

The `controlFlow` field provides additional naming hints:

| Control Flow | Likely Pattern | Name Hint |
|-------------|----------------|-----------|
| `return-nullish` | Getter with default | `getX` |
| `return-or` | Boolean check | `isX` or `hasX` |
| `if,return` | Guard/validation | `validateX` or `checkX` |
| `try,return` | Safe accessor | `tryGetX` |
| `throw` | Error thrower | `throwXError` |
| `await,return` | Async getter | `fetchX` or `loadX` |
| `switch,return` | Dispatcher | `handleX` or `dispatchX` |

### 4.4 Call Signature Context

The `callSignature` array shows what APIs the function uses:

| Call Pattern | Suggests |
|-------------|----------|
| `console.log`, `console.error` | Logging function |
| `JSON.parse`, `JSON.stringify` | Serialization |
| `fetch` | Network request |
| `process.env.$prop` | Environment reader |
| `Array.map`, `Array.filter` | Data transformer |

## Part 5: Adding New Rules to rules.ts

### 5.1 Rule Template

Add new rules to the `ANCHOR_NAME_RULES` array in `src/anchors/rules.ts`:

```typescript
// Category comment for grouping
{
  pattern: 'exact_string_to_match',
  isRegex: false,
  suggestedName: 'semanticFunctionName',
  confidence: 0.9,  // Use 0.85-0.95 for most rules
  description: 'Brief explanation of what this function does',
},

// Or for regex patterns
{
  pattern: '^prefix_',
  isRegex: true,
  suggestedName: 'genericNameForPattern',
  confidence: 0.8,  // Lower confidence for regex (more ambiguous)
  description: 'Matches all X-type functions',
},
```

### 5.2 Confidence Guidelines

| Confidence | When to Use |
|------------|-------------|
| 0.95 | Unique, specific anchor that definitively identifies one function |
| 0.90 | Strong indicator, very unlikely to match wrong function |
| 0.85 | Good indicator, may match related functions |
| 0.80 | Pattern-based rule, might match multiple similar functions |
| 0.75 | Weak indicator, use only when nothing better available |

### 5.3 Best Practices

1. **Prefer specific over generic**: `claude_code.session.count` is better than `session`
2. **Use exact match when possible**: `isRegex: false` with full string
3. **Avoid short patterns**: Patterns under 15 characters risk false matches
4. **Group related rules**: Add category comments for organization
5. **Document edge cases**: Use `description` to explain ambiguity

### 5.4 Incremental Addition Process

Add rules in batches, testing after each:

```typescript
// === NEW: Tool Handlers ===
{
  pattern: 'tool:bash',
  isRegex: false,
  suggestedName: 'handleBashTool',
  confidence: 0.9,
  description: 'Bash tool execution handler',
},
{
  pattern: 'tool:read',
  isRegex: false,
  suggestedName: 'handleReadTool',
  confidence: 0.9,
  description: 'File read tool handler',
},
// ... more tool handlers
```

## Part 6: Testing Changes

### 6.1 Rebuild After Changes

```bash
cd C:\Users\Nat\source\claudetracker
npm run build
```

### 6.2 Run Fingerprinting with New Rules

```bash
# Generate new fingerprints
CLI_JS="/tmp/claude-tracker-data/npm-global/lib/node_modules/@anthropic-ai/claude-code/cli.js"
node dist/cli/fingerprint.js "$CLI_JS" --with-anchors --json > /tmp/fingerprints-new.json

# Compare coverage
echo "Before:"
jq '[.[] | select(.inferredName != null)] | length' /tmp/fingerprints.json

echo "After:"
jq '[.[] | select(.inferredName != null)] | length' /tmp/fingerprints-new.json

# List newly named functions
jq -r '.[] | select(.inferredName != null) | .inferredName' /tmp/fingerprints-new.json | sort > /tmp/names-new.txt
jq -r '.[] | select(.inferredName != null) | .inferredName' /tmp/fingerprints.json | sort > /tmp/names-old.txt
comm -13 /tmp/names-old.txt /tmp/names-new.txt
```

### 6.3 Spot-Check New Matches

Verify that new rules match the right functions:

```bash
# Check specific new rule
RULE_PATTERN="your_new_pattern"
jq --arg p "$RULE_PATTERN" '
  .[] |
  select(.fingerprint.anchors | any(contains($p))) |
  {name: .name, inferredName: .inferredName, anchors: .fingerprint.anchors}
' /tmp/fingerprints-new.json
```

## Part 7: Cross-Version Validation

### 7.1 Run Validation Script

The validation script checks that rules work consistently across multiple Claude Code versions:

```bash
# Ensure data repo is cloned
DATA_REPO="/tmp/claude-tracker-data"
cd "$DATA_REPO" && git log --oneline -5  # Verify it's the right repo

# Run validation (requires bash/WSL on Windows)
cd C:\Users\Nat\source\claudetracker
bash scripts/validate-across-versions.sh
```

### 7.2 Validation Output Interpretation

The script tests against multiple versions and reports:

```
=== Cross-Version Fingerprint Validation ===

Processing version 2.0.71 (commit a90b8c0)...
  Version 2.0.71: 24/1847 functions with inferred names

Processing version 2.0.76 (commit 3811461)...
  Version 2.0.76: 24/1852 functions with inferred names

Processing version 2.1.2 (commit c859f28)...
  Version 2.1.2: 24/1890 functions with inferred names

=== Anchor Persistence Check ===
Anchor: 'CLAUDE_CONFIG_DIR'
  2.0.71: 1 functions contain this anchor
  2.0.76: 1 functions contain this anchor
  2.1.2: 1 functions contain this anchor
```

**Good signs**:
- Same anchors appear in all versions
- Named function count is similar across versions
- Same semantic name resolves in each version

**Warning signs**:
- Anchor appears in 0 functions in some versions (pattern may have changed)
- Wildly different function counts (may indicate false positives)

### 7.3 Update Validation Versions

If new Claude Code versions are available, update `scripts/validate-across-versions.sh`:

```bash
# Find available commits in data repo
cd /tmp/claude-tracker-data
git log --oneline | head -20

# Update VERSIONS array in validate-across-versions.sh
VERSIONS=(
    "commit1:version1"
    "commit2:version2"
    "commit3:version3"
)
```

## Part 8: Function Categories to Prioritize

Focus on these categories in order of value:

### 8.1 High Priority (Core Functionality)

1. **System Prompts** - Functions returning system prompt text
   - Look for: `You are Claude`, `You are a Claude agent`, `IMPORTANT:`, `CRITICAL:`
   - Naming: `getSystemPrompt`, `getAgentPrompt`, `getToolPrompt`

2. **Tool Handlers** - Functions that implement each tool
   - Look for: `tool:X` patterns, tool schema strings, tool names
   - Naming: `handleXTool`, `executeX`, `validateXInput`

3. **Settings/Config** - User preference handling
   - Look for: `CLAUDE_X` env vars, settings keys, config paths
   - Naming: `getXSetting`, `loadXConfig`, `isXEnabled`

4. **API Clients** - Functions making API calls
   - Look for: `api.anthropic.com`, endpoint paths, API keys
   - Naming: `callXApi`, `fetchX`, `postToX`

### 8.2 Medium Priority (Observability)

5. **Metrics** - Telemetry and usage tracking
   - Look for: `claude_code.X.count`, `claude_code.X.usage`
   - Naming: `getXCounter`, `recordXMetric`, `trackX`

6. **Error Handlers** - Exception handling and validation
   - Look for: Error message strings, `throw`, `catch`
   - Naming: `handleXError`, `validateX`, `assertX`

7. **Logging** - Debug and info output
   - Look for: Log prefixes, debug flags, console patterns
   - Naming: `logX`, `debugX`, `warnX`

### 8.3 Lower Priority (Infrastructure)

8. **Model Selection** - Model routing and selection
   - Look for: `claude-opus`, `claude-sonnet`, model IDs
   - Naming: `selectModel`, `getModelId`, `isModelAvailable`

9. **Auth/OAuth** - Authentication flows
   - Look for: OAuth endpoints, token patterns, auth URLs
   - Naming: `authenticateX`, `refreshToken`, `validateAuth`

10. **File Operations** - File system interactions
    - Look for: Path patterns, file extensions, directory operations
    - Naming: `readX`, `writeX`, `findX`

## Part 9: Iteration Workflow

### 9.1 Batch Process

Work in batches of 10-20 rules:

1. **Analyze**: Run anchor frequency analysis
2. **Select**: Choose 10-20 promising anchors from one category
3. **Research**: Check each anchor's context in the fingerprint data
4. **Draft**: Write rules with appropriate names and confidence
5. **Test**: Rebuild and verify coverage increase
6. **Validate**: Run cross-version validation
7. **Commit**: If validation passes, commit the changes

### 9.2 Example Batch Session

```bash
# 1. Focus on metrics category
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json |
  grep "^claude_code\." | sort | uniq -c | sort -rn | head -20

# 2. For each promising metric, check context
jq '.[] | select(.fingerprint.anchors | any(contains("claude_code.file_edit")))' /tmp/fingerprints.json

# 3. Add rules to rules.ts, then:
npm run build
node dist/cli/fingerprint.js "$CLI_JS" --with-anchors 2>&1 | grep "Auto-named:"

# 4. Validate
bash scripts/validate-across-versions.sh
```

### 9.3 Tracking Progress

Maintain a progress log:

```markdown
## Progress Log

### 2024-01-10
- Added 15 metric rules (claude_code.X.count patterns)
- Coverage: 24 -> 39 functions
- Validation: PASS on all 3 versions

### 2024-01-11
- Added 12 tool handler rules
- Coverage: 39 -> 51 functions
- Validation: PASS, but tool:edit changed between 2.0.71 and 2.0.76
```

## Part 10: Troubleshooting

### 10.1 Rule Not Matching

If a rule isn't matching expected functions:

```bash
# Verify the anchor exists in fingerprints
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep -F "your_pattern"

# Check for whitespace/encoding issues
jq -r '.[].fingerprint.anchors[]' /tmp/fingerprints.json | grep "your_pattern" | xxd | head

# Test regex syntax
node -e "console.log(/your_regex/.test('test_string'))"
```

### 10.2 False Positives

If a rule matches wrong functions:

1. Make the pattern more specific (longer string)
2. Add additional required context via a second rule
3. Lower the confidence score
4. Consider splitting into multiple specific rules

### 10.3 Version Instability

If an anchor appears in some versions but not others:

1. Check if the feature was added/removed between versions
2. Look for alternative anchors that are more stable
3. Consider using regex to handle pattern variations
4. Document the version range where the rule applies

## Summary Checklist

- [ ] Clone data repo and generate fresh fingerprints
- [ ] Analyze anchor frequency to find candidates
- [ ] Categorize anchors by function type
- [ ] Add rules in batches of 10-20
- [ ] Rebuild and test after each batch
- [ ] Run cross-version validation
- [ ] Track coverage progress
- [ ] Target 100+ named functions for meaningful improvement
