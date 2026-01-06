/**
 * Type definitions for semantic symbol naming system
 */

export interface Anchor {
  type: 'string' | 'env' | 'property' | 'call';
  value: string;
  context?: string;
}

export interface FunctionFingerprint {
  /** SHA256 hash of normalized structure */
  hash: string;

  /** Minified name in source */
  minifiedName: string;

  /** Stable strings/identifiers found in function */
  anchors: string[];

  /** Number of function parameters */
  paramCount: number;

  /** Normalized call signatures */
  callSignature: string[];

  /** Control flow pattern (if/for/while/try) */
  controlFlow: string;

  /** AST node count */
  nodeCount: number;

  /** Maximum nesting depth */
  depth: number;

  /** Source location */
  location: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface SymbolEntry {
  /** Unique identifier */
  id: string;

  /** Fingerprint hash */
  fingerprint: string;

  /** Human-readable name */
  name: string;

  /** How the name was determined */
  source: 'manual' | 'inferred' | 'propagated';

  /** Confidence score 0-1 */
  confidence: number;

  /** ISO date first seen */
  firstSeen: string;

  /** ISO date last seen */
  lastSeen: string;

  /** Versions where this mapping held */
  versions: string[];

  /** Anchors used for matching */
  anchors: string[];

  /** Human annotation */
  notes?: string;
}

export interface VersionManifest {
  /** Claude Code version */
  version: string;

  /** ISO timestamp */
  timestamp: string;

  /** Mapping of minified name to symbol ID */
  symbols: Record<string, string>;

  /** Statistics */
  stats: {
    total: number;
    named: number;
    inferred: number;
    unknown: number;
  };
}

export interface NameResolution {
  /** Resolved name, null if unknown */
  name: string | null;

  /** Confidence score 0-1 */
  confidence: number;

  /** How the name was resolved */
  source: 'exact' | 'anchor' | 'similar' | 'unknown';

  /** Symbol entry ID if matched */
  symbolId?: string;
}

export interface AnchorRule {
  /** Pattern to match (string or regex) */
  pattern: string;

  /** Whether pattern is regex */
  isRegex: boolean;

  /** Suggested function name */
  suggestedName: string;

  /** Confidence when this rule matches */
  confidence: number;

  /** Description of what this anchor indicates */
  description?: string;
}

export interface PropagationMatch {
  /** Minified name in new version */
  newMinified: string;

  /** Minified name in previous version */
  prevMinified: string;

  /** Stored semantic name */
  storedName: string | null;

  /** Match confidence */
  confidence: number;

  /** Matching method */
  method: 'fingerprint' | 'anchor' | 'structure';
}
