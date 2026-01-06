# Semantic Symbol Naming for Deminified Code

## Overview

Transform minified JavaScript symbols into meaningful names that persist across
version changes. When `EB()` in v1 becomes `Xz()` in v2, both should resolve to
`getClaudeConfigDir()` if they serve the same purpose.

## Problem Statement

Current tracker output (after Prettier):
```javascript
function EB() {
  return process.env.CLAUDE_CONFIG_DIR ?? euQ(AmQ(), ".claude");
}
```

Goal:
```javascript
function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR ?? joinPath(getHomeDir(), ".claude");
}
```

Challenges:
1. Minified names change between builds (`EB` → `Xz` → `Qm`)
2. Same logical function has different textual representation each version
3. Need identity that survives minification changes

## Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Symbol Naming Pipeline                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌─────────────┐  │
│  │  Parser  │───▶│  Anchor   │───▶│Fingerprint│───▶│  Name       │  │
│  │ (Babel)  │    │ Extractor │    │ Generator │    │  Resolver   │  │
│  └──────────┘    └───────────┘    └──────────┘    └─────────────┘  │
│       │                                                  │          │
│       ▼                                                  ▼          │
│  ┌──────────┐                                    ┌─────────────┐   │
│  │   AST    │                                    │   Symbol    │   │
│  │  Cache   │                                    │   Store     │   │
│  └──────────┘                                    └─────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 1. Parser Layer

**Tool**: Babel with `@babel/parser`

Parse prettified JavaScript into AST for analysis.

```javascript
import { parse } from '@babel/parser';

const ast = parse(code, {
  sourceType: 'module',
  plugins: ['jsx', 'typescript'],
});
```

### 2. Anchor Extractor

Identify stable markers within functions that are unlikely to change:

**Anchor Types** (ordered by stability):

| Type | Example | Stability |
|------|---------|-----------|
| Metric names | `"claude_code.session.count"` | Very High |
| Env vars | `process.env.CLAUDE_CONFIG_DIR` | Very High |
| API URLs | `"https://api.anthropic.com"` | High |
| Error messages | `"Invalid renderer id"` | High |
| Type checks | `"[object Map]"` | High |
| Console logs | `console.log("...")` | Medium |

**Extraction Algorithm**:
```javascript
function extractAnchors(functionNode) {
  const anchors = [];

  traverse(functionNode, {
    StringLiteral(path) {
      const value = path.node.value;
      if (isStableString(value)) {
        anchors.push({
          type: 'string',
          value,
          context: getContext(path),
        });
      }
    },
    MemberExpression(path) {
      if (isEnvAccess(path)) {
        anchors.push({
          type: 'env',
          value: getEnvName(path),
        });
      }
    },
  });

  return anchors;
}
```

**Stable String Heuristics**:
- Contains `.` with known prefixes (`claude_code.`, `anthropic.`)
- Matches URL pattern
- Contains known error message fragments
- Object type check pattern `[object X]`
- Length > 20 characters (likely meaningful)

### 3. Structural Fingerprinting

Create identity hash based on AST structure, ignoring variable names.

**Fingerprint Components**:

```javascript
interface FunctionFingerprint {
  // Primary identity
  anchors: string[];           // Sorted stable strings found

  // Structural signature
  paramCount: number;          // Number of parameters
  callSignature: string[];     // Methods/functions called (normalized)
  controlFlow: string;         // if/for/while/try pattern
  returnType: string;          // Inferred return type pattern

  // Size metrics
  nodeCount: number;           // AST node count
  depth: number;               // Max nesting depth
}
```

**Normalization Rules**:
- Variable names → positional placeholders (`$0`, `$1`, `$2`)
- Local function calls → `$call`
- External calls → preserve name (`console.log`, `process.env`)
- Literals → preserve type but not value for non-anchors

**Example**:
```javascript
// Original minified
function EB() {
  return process.env.CLAUDE_CONFIG_DIR ?? euQ(AmQ(), ".claude");
}

// Normalized fingerprint
{
  anchors: ["CLAUDE_CONFIG_DIR", ".claude"],
  paramCount: 0,
  callSignature: ["process.env.$prop", "$call($call(), $string)"],
  controlFlow: "return-nullish",
  returnType: "string",
  nodeCount: 12,
  depth: 3
}
```

**Hash Generation**:
```javascript
function generateFingerprint(fn) {
  const components = [
    fn.anchors.sort().join('|'),
    fn.paramCount,
    fn.callSignature.sort().join(','),
    fn.controlFlow,
    fn.nodeCount,
  ];
  return sha256(components.join('::'));
}
```

### 4. Name Resolution

Match fingerprints to known names using cascading strategies:

```javascript
function resolveName(fingerprint, context) {
  // 1. Exact fingerprint match from store
  let name = symbolStore.getByFingerprint(fingerprint.hash);
  if (name) return { name, confidence: 1.0 };

  // 2. Anchor-based inference
  name = inferFromAnchors(fingerprint.anchors);
  if (name) return { name, confidence: 0.9 };

  // 3. Structural similarity match (fuzzy)
  const similar = symbolStore.findSimilar(fingerprint, threshold: 0.85);
  if (similar) return { name: similar.name, confidence: similar.score };

  // 4. Keep minified name with annotation
  return { name: null, confidence: 0 };
}
```

**Anchor-Based Naming Rules**:
```javascript
const ANCHOR_TO_NAME = {
  'CLAUDE_CONFIG_DIR': 'getClaudeConfigDir',
  'claude_code.session.count': 'getSessionCounter',
  'claude_code.cost.usage': 'getCostCounter',
  'api.anthropic.com': 'getAnthropicApiUrl',
  'You are Claude Code': 'getSystemPrompt',
};
```

### 5. Symbol Store

Persistent storage for fingerprint → name mappings.

**Schema**:
```typescript
interface SymbolEntry {
  id: string;                    // UUID
  fingerprint: string;           // SHA256 hash
  name: string;                  // Human-readable name
  source: 'manual' | 'inferred' | 'propagated';
  confidence: number;            // 0-1
  firstSeen: string;             // ISO date
  lastSeen: string;              // ISO date
  versions: string[];            // Versions where this mapping held
  anchors: string[];             // Anchors used for matching
  notes?: string;                // Human annotation
}

interface VersionManifest {
  version: string;
  timestamp: string;
  symbols: {
    [minifiedName: string]: string;  // minified → symbolId
  };
  stats: {
    total: number;
    named: number;
    inferred: number;
    unknown: number;
  };
}
```

**Storage Format**: JSONL files in data repo
```
symbols/
├── mappings.jsonl      # All symbol entries
├── manifests/
│   ├── 2.0.20.json    # Version-specific mappings
│   └── 2.0.21.json
└── anchors.jsonl       # Anchor → name rules
```

### 6. Version Chaining

Propagate names from version N to version N+1.

**Algorithm**:
```javascript
async function propagateNames(prevVersion, newVersion) {
  const prevAST = await parseVersion(prevVersion);
  const newAST = await parseVersion(newVersion);

  // 1. Extract all functions from both versions
  const prevFunctions = extractFunctions(prevAST);
  const newFunctions = extractFunctions(newAST);

  // 2. Compute fingerprints
  const prevFingerprints = prevFunctions.map(computeFingerprint);
  const newFingerprints = newFunctions.map(computeFingerprint);

  // 3. Match by fingerprint
  const matches = [];
  for (const newFp of newFingerprints) {
    const match = findBestMatch(newFp, prevFingerprints);
    if (match && match.score > 0.85) {
      matches.push({
        newMinified: newFp.minifiedName,
        prevMinified: match.fingerprint.minifiedName,
        storedName: symbolStore.getName(match.fingerprint.hash),
        confidence: match.score,
      });
    }
  }

  // 4. Update store with new mappings
  for (const match of matches) {
    symbolStore.recordMapping(newVersion, match);
  }

  return matches;
}
```

**Diff Strategy** (for structural changes):
When exact fingerprint doesn't match:
1. Use GumTree AST diff to find moved/modified nodes
2. Track rename chains: if A→B in v1→v2, and B→C in v2→v3, infer A→C
3. Flag low-confidence matches for manual review

## Implementation Plan

### Phase 1: Foundation (MVP)

1. **Parser setup** - Babel config, AST caching
2. **Anchor extraction** - String literals, env vars
3. **Basic fingerprinting** - Anchors + param count + node count
4. **Simple store** - JSONL read/write

Deliverable: Can parse, fingerprint, and store symbol mappings

### Phase 2: Name Resolution

1. **Manual annotation tool** - CLI to name symbols
2. **Anchor-based inference** - Auto-name from known anchors
3. **Apply names** - Transform AST, output renamed code

Deliverable: Can rename some symbols automatically

### Phase 3: Version Propagation

1. **Fingerprint matching** - Exact + fuzzy matching
2. **Version manifests** - Track per-version mappings
3. **Propagation algorithm** - Carry names forward
4. **Confidence scoring** - Track match quality

Deliverable: Names persist across version updates

### Phase 4: Polish

1. **GumTree integration** - Better diff-based matching
2. **Reporting** - Coverage stats, confidence distribution
3. **Annotation UI** - Web interface for manual naming
4. **CI integration** - Auto-run on new versions

## File Structure

```
src/
├── parser/
│   ├── index.ts         # Babel parser wrapper
│   └── cache.ts         # AST caching
├── anchors/
│   ├── extractor.ts     # Anchor extraction
│   ├── rules.ts         # Stability heuristics
│   └── inference.ts     # Anchor → name mapping
├── fingerprint/
│   ├── generator.ts     # Fingerprint computation
│   ├── normalizer.ts    # AST normalization
│   └── hasher.ts        # Fingerprint hashing
├── store/
│   ├── symbols.ts       # Symbol store CRUD
│   ├── manifests.ts     # Version manifest management
│   └── schema.ts        # TypeScript types
├── resolver/
│   ├── index.ts         # Name resolution logic
│   └── strategies.ts    # Resolution strategies
├── propagate/
│   ├── matcher.ts       # Cross-version matching
│   └── chain.ts         # Version chaining
└── cli/
    ├── annotate.ts      # Manual annotation
    ├── rename.ts        # Apply names to code
    └── stats.ts         # Coverage reporting
```

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Symbol consistency | 80%+ | Same logical symbol → same name across versions |
| Anchor coverage | 50%+ | Functions with at least one stable anchor |
| Auto-naming rate | 30%+ | Symbols named without manual intervention |
| False positive rate | <5% | Wrong names applied |

## Open Questions

1. **Scope**: Function-level only, or also variables within functions?
2. **Granularity**: Name every function, or focus on "important" ones?
3. **Storage location**: In tracker-data repo, or separate?
4. **Manual annotation workflow**: CLI only, or web UI needed?

## References

- [Babel Parser](https://babeljs.io/docs/babel-parser)
- [GumTree AST Diff](https://github.com/GumTreeDiff/gumtree)
- [JSNice](http://jsnice.org/) - ML-based naming (for reference)
- [source-map](https://github.com/nicknisi/source-map) - Potential future integration
