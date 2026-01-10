# Toward Readable Deminified Code

## The Real Goal

Transform this:
```javascript
function EB() {
  return process.env.CLAUDE_CONFIG_DIR ?? euQ(AmQ(), ".claude");
}
var A1 = { Bash: Xz, Read: Qm, Write: Rv, Glob: Tv, Grep: Uv };
class En0 { constructor(a) { this.x = a; } y(b) { return this.x + b; } }
```

Into something approaching the original source:
```javascript
// src/config/paths.ts
function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR ?? joinPath(getHomeDir(), ".claude");
}

// src/tools/registry.ts
var TOOL_REGISTRY = {
  Bash: executeBashTool,
  Read: executeReadTool,
  Write: executeWriteTool,
  Glob: executeGlobTool,
  Grep: executeGrepTool
};

// src/core/BaseHandler.ts
class BaseHandler {
  constructor(config) { this.config = config; }
  execute(input) { return this.config + input; }
}
```

**Current reality**: 24 functions renamed out of ~2,200+ identifiers = 1% coverage.
**Target**: 60%+ of meaningful identifiers renamed, code logically grouped with comments.

## Why the Current Approach Falls Short

The current strategy is "add anchor rules one by one":
- Each rule requires manual analysis
- Only functions with unique string literals get renamed
- Variables, classes, parameters all stay minified
- No structural inference from code patterns
- No leveraging of available type information

This is like translating a book word-by-word with a dictionary. It works, but you'll die of old age before finishing.

## Three Levels of Readability

### Level 1: Current (Anchor-Based Naming)
- Match string literals to function names
- ~50-100 functions nameable
- Leaves 95%+ of code minified

### Level 2: Structural Inference (This Plan)
- Analyze code patterns to infer names
- Propagate names through the dependency graph
- Rename variables, parameters, classes
- Extract logical modules from the bundle
- Target: 60%+ meaningful coverage

### Level 3: Full Decompilation (Future)
- Source map recovery (if Anthropic ever publishes them)
- ML-based name prediction (like JSNice)
- Manual annotation of remaining symbols
- Target: 90%+ coverage

This plan focuses on Level 2.

---

## Part 1: Structural Inference Strategies

### 1.1 Exploit Bundler Patterns

Modern bundlers (esbuild, webpack) leave fingerprints:

```javascript
// Module factory pattern - the number often indicates module order
var A1 = U((exports, module) => { ... });

// Re-export pattern - tells us what symbols are public
G5(A, { Tool1: () => Xz, Tool2: () => Qm });

// Import pattern - shows dependencies
var { x: foo, y: bar } = require("./module");
```

**Action**: Parse the bundle structure to identify:
- Module boundaries (each `U((exports, module) => ...)` is one file)
- Public exports (G5 re-export calls)
- Import/export relationships

### 1.2 Object Property Inference

When we see:
```javascript
var tools = { Bash: Xz, Read: Qm, Write: Rv };
```

We can infer:
- `Xz` is likely `bashHandler` or `executeBash`
- `Qm` is likely `readHandler` or `executeRead`
- `Rv` is likely `writeHandler` or `executeWrite`

**Action**: Track object literal assignments where keys are readable names, propagate to values.

### 1.3 Class Method Naming

Classes have structure that survives minification:
```javascript
class En0 {
  constructor(a) { this.config = a; }
  execute(b) { return this.handler(b); }
  get name() { return "ToolX"; }
}
```

Getters named `name` that return string literals are gold - they tell us what the class is called.

**Action**: Find classes with `name` getters returning strings, rename the class.

### 1.4 Parameter Name Inference from JSDoc/TypeScript

The sdk-tools.d.ts file provides type information:
```typescript
export interface BashInput {
  command: string;
  timeout?: number;
  description?: string;
}
```

If we can correlate functions to these interfaces (by matching parameter patterns), we can name parameters.

**Action**: Parse .d.ts files, match function signatures, apply parameter names.

### 1.5 Call Graph Propagation

If we know `Xz` is `executeBashTool`, and we see:
```javascript
function ABC() { return Xz(...arguments); }
```

Then `ABC` is likely a wrapper, nameable as `executeBashToolWrapper` or similar.

**Action**: Build call graph, propagate names from known functions to their callers/callees.

---

## Part 2: Variable and Parameter Renaming

### 2.1 The Problem

Current deminifier only renames function names, not:
- Local variables inside functions
- Function parameters
- Class properties
- Imported names

### 2.2 Scope-Aware Renaming

Implement renaming within scopes:

```javascript
// Before
function getConfigDir(a, b) {
  var c = process.env.CLAUDE_CONFIG_DIR;
  var d = a ?? joinPath(b, ".claude");
  return d || c;
}

// After (with parameter inference)
function getConfigDir(envOverride, homeDir) {
  var envValue = process.env.CLAUDE_CONFIG_DIR;
  var defaultPath = envOverride ?? joinPath(homeDir, ".claude");
  return defaultPath || envValue;
}
```

**Strategies for variable naming**:
1. **Type-based**: If assigned a string, call it `str` or `value`
2. **Source-based**: If assigned from `process.env.X`, call it `envX`
3. **Usage-based**: If passed to `JSON.parse()`, call it `jsonString`
4. **Position-based**: First param often `input`, `config`, or `options`

### 2.3 Implementation

Extend `deminify.ts` to:
1. Track scope chains
2. For each scope, analyze variable usage patterns
3. Apply naming heuristics
4. Use Babel's `scope.rename()` for safe renaming

---

## Part 3: Comment Injection

### 3.1 Function Documentation

Add comments explaining what functions do:

```javascript
/**
 * Gets the Claude configuration directory.
 * Checks CLAUDE_CONFIG_DIR env var, falls back to ~/.claude
 * @inferred from anchor: CLAUDE_CONFIG_DIR
 */
function getClaudeConfigDir() {
  return process.env.CLAUDE_CONFIG_DIR ?? joinPath(getHomeDir(), ".claude");
}
```

### 3.2 Section Markers

Group related functions with section comments:

```javascript
// ============================================================
// TOOL HANDLERS (src/tools/*.ts)
// Functions that implement each tool Claude can use
// ============================================================

function executeBashTool(input) { ... }
function executeReadTool(input) { ... }
function executeWriteTool(input) { ... }

// ============================================================
// CONFIGURATION (src/config/*.ts)
// Settings, environment variables, paths
// ============================================================

function getClaudeConfigDir() { ... }
function getClaudeApiKey() { ... }
```

### 3.3 Implementation

1. Parse fingerprint data to find function clusters (by anchor patterns)
2. Group functions by inferred category
3. Generate section comments
4. Inject into AST before generation

---

## Part 4: Module Extraction

### 4.1 The Vision

Instead of one 5000-line file, produce:
```
deminified/
├── index.js           # Main entry, imports everything
├── tools/
│   ├── bash.js
│   ├── read.js
│   └── ...
├── config/
│   ├── paths.js
│   └── settings.js
├── api/
│   ├── anthropic.js
│   └── oauth.js
└── ui/
    ├── terminal.js
    └── prompts.js
```

### 4.2 Module Detection

Identify module boundaries in the bundle:

```javascript
// Each of these is likely a separate source file:
var module1 = U((exports, module) => {
  // ... module 1 code
});

var module2 = U((exports, module) => {
  // ... module 2 code
});
```

### 4.3 Dependency Tracking

Build the import graph:
```javascript
// If module2 references module1:
var { exportedThing } = module1;
// This becomes:
import { exportedThing } from './module1.js';
```

### 4.4 File Naming

Use anchors and exports to name files:
- Module with `CLAUDE_CONFIG_DIR` anchor -> `config/paths.js`
- Module with `api.anthropic.com` anchor -> `api/anthropic.js`
- Module exporting `{ Bash, Read, Write }` -> `tools/registry.js`

---

## Part 5: Leveraging sdk-tools.d.ts

### 5.1 Available Type Information

The package includes `sdk-tools.d.ts` with:
- All tool input interfaces (BashInput, ReadInput, etc.)
- Parameter names and types
- JSDoc comments

### 5.2 Matching Strategy

For each function that handles tool input:
1. Analyze its parameter structure
2. Match against known interfaces
3. Apply parameter names from interface

```typescript
// From sdk-tools.d.ts:
interface BashInput {
  command: string;
  timeout?: number;
  description?: string;
}

// Matches function with signature like:
function Xz(a) {
  // Uses a.command, a.timeout, a.description
}
// -> Rename to executeBashTool(input: BashInput)
```

### 5.3 Implementation

1. Parse `sdk-tools.d.ts` into interface map
2. For each tool handler function, check property accesses
3. Match accessed properties to interface fields
4. Rename parameters and add type annotations as comments

---

## Part 6: Implementation Roadmap

### Phase 1: Enhanced Infrastructure (Week 1)

**Goal**: Build tooling for batch operations

1. **Bundle Parser**
   - Detect esbuild/webpack patterns
   - Extract module boundaries
   - Map export relationships

2. **Call Graph Builder**
   - Track all function calls
   - Build caller/callee relationships
   - Identify function clusters

3. **Symbol Database**
   - Store all identified symbols
   - Track confidence levels
   - Support batch updates

**Deliverable**: Can analyze bundle structure and output module map

### Phase 2: Structural Inference (Week 2)

**Goal**: Auto-name from patterns

1. **Object Property Inference**
   - Parse object literals with readable keys
   - Propagate names to minified values

2. **Class Name Inference**
   - Find classes with `name` getters
   - Rename class definitions

3. **Export Name Inference**
   - Track what names things are exported as
   - Rename to match export names

**Deliverable**: 200+ additional symbols named automatically

### Phase 3: Variable Renaming (Week 3)

**Goal**: Rename within function bodies

1. **Scope Analysis**
   - Track variable declarations and usages
   - Build scope chains

2. **Variable Naming Heuristics**
   - Type-based naming
   - Source-based naming
   - Usage-based naming

3. **Safe Renaming**
   - Use Babel scope analysis
   - Handle shadowing correctly

**Deliverable**: Variables renamed with meaningful (if generic) names

### Phase 4: Module Extraction (Week 4)

**Goal**: Split bundle into logical files

1. **Module Boundary Detection**
   - Parse bundler factory patterns
   - Identify module starts/ends

2. **Dependency Resolution**
   - Track cross-module references
   - Generate import statements

3. **File Generation**
   - Name files based on content
   - Write separate JS files
   - Generate index.js with re-exports

**Deliverable**: Multi-file output matching original structure

### Phase 5: Documentation & Polish (Week 5)

**Goal**: Make output genuinely readable

1. **Comment Injection**
   - Add function documentation
   - Add section markers
   - Add module headers

2. **Type Annotations**
   - Parse sdk-tools.d.ts
   - Add JSDoc type comments

3. **Formatting**
   - Consistent style
   - Logical ordering
   - Clean imports

**Deliverable**: Publication-ready deminified code

---

## Part 7: New Tools and Commands

### 7.1 analyze-bundle

```bash
node dist/cli/analyze-bundle.js <cli.js>
```

Output:
```
Bundle Analysis:
- Total size: 3.2MB
- Modules detected: 47
- Functions: 2,234
- Classes: 12
- Variables: 15,064

Module Map:
- Module 0: Entry point (exports main)
- Module 1: Config (CLAUDE_CONFIG_DIR, CLAUDE_API_KEY)
- Module 2: Tools (Bash, Read, Write, Glob, Grep)
...
```

### 7.2 infer-names

```bash
node dist/cli/infer-names.js <fingerprints.json> --strategy=all
```

Strategies:
- `anchors` - Current approach
- `objects` - Object property inference
- `classes` - Class name inference
- `exports` - Export name inference
- `callgraph` - Propagation through calls
- `all` - All of the above

### 7.3 extract-modules

```bash
node dist/cli/extract-modules.js <cli.js> --output=./deminified/
```

Output:
```
deminified/
├── index.js
├── modules/
│   ├── config.js
│   ├── tools.js
│   ├── api.js
│   └── ...
└── README.md (generated, explains structure)
```

### 7.4 deminify (enhanced)

```bash
node dist/cli/deminify.js <cli.js> <fingerprints.json> \
  --rename-variables \
  --inject-comments \
  --output=./output.js
```

New flags:
- `--rename-variables` - Rename local variables
- `--inject-comments` - Add documentation comments
- `--extract-modules` - Split into multiple files
- `--type-annotations` - Add JSDoc from .d.ts

---

## Part 8: Success Metrics

| Metric | Current | Phase 1 | Phase 2 | Phase 3 | Phase 4 | Phase 5 |
|--------|---------|---------|---------|---------|---------|---------|
| Functions named | 24 | 24 | 250+ | 250+ | 250+ | 300+ |
| Variables renamed | 0 | 0 | 0 | 5000+ | 5000+ | 5000+ |
| Classes named | 0 | 0 | 10+ | 10+ | 10+ | 12+ |
| Modules extracted | 0 | 0 | 0 | 0 | 40+ | 40+ |
| Has comments | No | No | No | No | No | Yes |
| Type annotations | No | No | No | No | No | Yes |
| **Overall readability** | 5% | 5% | 20% | 40% | 60% | 70%+ |

---

## Part 9: Technical Architecture

### New File Structure

```
src/
├── cli/
│   ├── deminify.ts        # Enhanced with new features
│   ├── analyze-bundle.ts  # New: bundle structure analysis
│   ├── infer-names.ts     # New: structural inference
│   └── extract-modules.ts # New: module extraction
├── analysis/
│   ├── bundle-parser.ts   # Parse bundler patterns
│   ├── call-graph.ts      # Build function call graph
│   ├── scope-analyzer.ts  # Analyze variable scopes
│   └── type-matcher.ts    # Match functions to .d.ts types
├── inference/
│   ├── object-props.ts    # Infer from object literals
│   ├── class-names.ts     # Infer from class structure
│   ├── export-names.ts    # Infer from export statements
│   └── propagate.ts       # Propagate through call graph
├── transform/
│   ├── rename-vars.ts     # Variable renaming
│   ├── inject-comments.ts # Add documentation
│   └── extract-module.ts  # Split into files
└── store/
    ├── symbol-db.ts       # Enhanced symbol storage
    └── inference-cache.ts # Cache inference results
```

### Core Data Structures

```typescript
interface BundleAnalysis {
  modules: ModuleInfo[];
  exports: ExportInfo[];
  callGraph: Map<string, string[]>;
  symbolMap: Map<string, InferredSymbol>;
}

interface ModuleInfo {
  id: number;
  startLine: number;
  endLine: number;
  exports: string[];
  imports: string[];
  suggestedName: string;
  anchors: string[];
}

interface InferredSymbol {
  minifiedName: string;
  inferredName: string;
  confidence: number;
  source: 'anchor' | 'object' | 'class' | 'export' | 'callgraph' | 'manual';
  location: Location;
  type: 'function' | 'variable' | 'class' | 'parameter';
}
```

---

## Part 10: Getting Started (Immediate Actions)

### Week 1: Foundation

1. **Build the bundle analyzer**
   ```bash
   # Create src/cli/analyze-bundle.ts
   # Parse cli.js and output module structure
   npm run build && node dist/cli/analyze-bundle.js "$CLI_JS"
   ```

2. **Run initial analysis**
   - Count modules detected
   - List all export patterns
   - Identify tool handlers by export name

3. **Enhance fingerprinting**
   - Add export name detection to fingerprint data
   - Track which module each function belongs to

### Quick Win: Object Property Inference

The easiest improvement with highest impact:

```javascript
// Find patterns like:
var TOOLS = { Bash: Xz, Read: Qm, Write: Rv };

// Automatically infer:
// Xz -> "bashTool" or "handleBash"
// Qm -> "readTool" or "handleRead"
// Rv -> "writeTool" or "handleWrite"
```

Implementation:
1. Find all ObjectExpression nodes
2. Filter to those with Identifier keys (readable names)
3. If value is an Identifier (minified), create name mapping
4. Apply prefix/suffix based on context ("Tool", "Handler", etc.)

This alone could identify 50+ symbols.

---

## Conclusion

The path to readable deminified code is not "add more anchor rules" but "think structurally":

1. **Leverage the bundler** - It left clues about module boundaries
2. **Follow the names** - Export names, object keys, class getters tell us what things are called
3. **Propagate knowledge** - Once we know one name, we can often infer related names
4. **Be comprehensive** - Don't just rename functions; rename variables, add comments, extract modules

The goal is not perfect reconstruction (that requires source maps or the actual source). The goal is **readable code** - where a developer can understand the structure, find relevant sections, and follow the logic.

With the approach outlined here, we can go from 1% coverage to 60%+ meaningful readability, transforming the deminified output from "technically unpacked" to "genuinely useful for understanding Claude Code's architecture."
