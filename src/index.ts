/**
 * Claude Tracker - Semantic Symbol Naming
 *
 * Transform minified JavaScript symbols into meaningful names
 * that persist across version changes.
 */

export { parseCode, parseFile, parseCodeCached, clearCache, getNodeSource } from './parser/index.js';
export { extractAnchors, extractUniqueAnchorValues } from './anchors/extractor.js';
export { isStableString, findMatchingRule, inferNameFromAnchors, ANCHOR_NAME_RULES, STABLE_STRING_PATTERNS } from './anchors/rules.js';
export { generateFingerprint, compareFingerprintSimilarity } from './fingerprint/generator.js';
export { SymbolStore, saveVersionManifest, loadVersionManifest } from './store/symbols.js';
export type {
  Anchor,
  FunctionFingerprint,
  SymbolEntry,
  VersionManifest,
  NameResolution,
  AnchorRule,
  PropagationMatch,
} from './store/schema.js';
