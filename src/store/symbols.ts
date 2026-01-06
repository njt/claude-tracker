/**
 * Symbol store for persisting fingerprint → name mappings
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { randomUUID } from 'crypto';
import type { SymbolEntry, VersionManifest, NameResolution, FunctionFingerprint } from './schema.js';
import { inferNameFromAnchors } from '../anchors/rules.js';
import { compareFingerprintSimilarity } from '../fingerprint/generator.js';

/**
 * JSONL-based symbol store
 */
export class SymbolStore {
  private symbols: Map<string, SymbolEntry> = new Map();
  private fingerprintIndex: Map<string, string> = new Map(); // fingerprint → symbolId
  private dirty = false;

  constructor(private storagePath: string) {}

  /**
   * Load symbols from storage
   */
  async load(): Promise<void> {
    const mappingsPath = join(this.storagePath, 'mappings.jsonl');

    if (!existsSync(mappingsPath)) {
      return;
    }

    const content = await readFile(mappingsPath, 'utf-8');
    const lines = content.split('\n').filter((line) => line.trim());

    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as SymbolEntry;
        this.symbols.set(entry.id, entry);
        this.fingerprintIndex.set(entry.fingerprint, entry.id);
      } catch {
        // Skip invalid lines
      }
    }
  }

  /**
   * Save symbols to storage
   */
  async save(): Promise<void> {
    if (!this.dirty) return;

    await mkdir(this.storagePath, { recursive: true });

    const mappingsPath = join(this.storagePath, 'mappings.jsonl');
    const lines = Array.from(this.symbols.values()).map((entry) => JSON.stringify(entry));

    await writeFile(mappingsPath, lines.join('\n') + '\n');
    this.dirty = false;
  }

  /**
   * Get symbol by fingerprint hash
   */
  getByFingerprint(hash: string): SymbolEntry | null {
    const id = this.fingerprintIndex.get(hash);
    if (!id) return null;
    return this.symbols.get(id) ?? null;
  }

  /**
   * Get symbol by ID
   */
  getById(id: string): SymbolEntry | null {
    return this.symbols.get(id) ?? null;
  }

  /**
   * Add or update a symbol entry
   */
  upsert(entry: Omit<SymbolEntry, 'id' | 'firstSeen' | 'lastSeen'>): SymbolEntry {
    const existing = this.getByFingerprint(entry.fingerprint);
    const now = new Date().toISOString();

    if (existing) {
      // Update existing
      existing.name = entry.name;
      existing.source = entry.source;
      existing.confidence = entry.confidence;
      existing.lastSeen = now;
      existing.anchors = entry.anchors;
      if (entry.notes) existing.notes = entry.notes;
      if (!existing.versions.includes(entry.versions[0])) {
        existing.versions.push(...entry.versions);
      }
      this.dirty = true;
      return existing;
    }

    // Create new
    const newEntry: SymbolEntry = {
      id: randomUUID(),
      fingerprint: entry.fingerprint,
      name: entry.name,
      source: entry.source,
      confidence: entry.confidence,
      firstSeen: now,
      lastSeen: now,
      versions: entry.versions,
      anchors: entry.anchors,
      notes: entry.notes,
    };

    this.symbols.set(newEntry.id, newEntry);
    this.fingerprintIndex.set(newEntry.fingerprint, newEntry.id);
    this.dirty = true;

    return newEntry;
  }

  /**
   * Find similar symbols by fingerprint comparison
   */
  findSimilar(
    fingerprint: FunctionFingerprint,
    threshold = 0.85
  ): { entry: SymbolEntry; score: number } | null {
    let bestMatch: { entry: SymbolEntry; score: number } | null = null;

    for (const entry of this.symbols.values()) {
      // Quick check: anchor overlap
      const anchorOverlap = fingerprint.anchors.some((a) => entry.anchors.includes(a));
      if (!anchorOverlap && entry.anchors.length > 0) continue;

      // Build a pseudo-fingerprint from the entry for comparison
      // This is imperfect but works for basic similarity
      const pseudoFp: FunctionFingerprint = {
        hash: entry.fingerprint,
        minifiedName: '',
        anchors: entry.anchors,
        paramCount: 0, // Unknown from entry
        callSignature: [],
        controlFlow: '',
        nodeCount: 0,
        depth: 0,
        location: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } },
      };

      // For anchor-only comparison
      const score = computeAnchorSimilarity(fingerprint.anchors, entry.anchors);

      if (score >= threshold && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { entry, score };
      }
    }

    return bestMatch;
  }

  /**
   * Resolve a name for a fingerprint
   */
  resolveName(fingerprint: FunctionFingerprint): NameResolution {
    // 1. Exact fingerprint match
    const exactMatch = this.getByFingerprint(fingerprint.hash);
    if (exactMatch) {
      return {
        name: exactMatch.name,
        confidence: exactMatch.confidence,
        source: 'exact',
        symbolId: exactMatch.id,
      };
    }

    // 2. Anchor-based inference
    const inferred = inferNameFromAnchors(fingerprint.anchors);
    if (inferred) {
      return {
        name: inferred.name,
        confidence: inferred.confidence,
        source: 'anchor',
      };
    }

    // 3. Similar fingerprint match
    const similar = this.findSimilar(fingerprint);
    if (similar) {
      return {
        name: similar.entry.name,
        confidence: similar.score * similar.entry.confidence,
        source: 'similar',
        symbolId: similar.entry.id,
      };
    }

    // 4. Unknown
    return {
      name: null,
      confidence: 0,
      source: 'unknown',
    };
  }

  /**
   * Get all symbols
   */
  getAll(): SymbolEntry[] {
    return Array.from(this.symbols.values());
  }

  /**
   * Get statistics
   */
  getStats(): { total: number; bySource: Record<string, number> } {
    const bySource: Record<string, number> = {};
    for (const entry of this.symbols.values()) {
      bySource[entry.source] = (bySource[entry.source] ?? 0) + 1;
    }
    return {
      total: this.symbols.size,
      bySource,
    };
  }
}

/**
 * Compute anchor-only similarity (Jaccard)
 */
function computeAnchorSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0;
  if (a.length === 0 || b.length === 0) return 0;

  const setA = new Set(a);
  const setB = new Set(b);

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

/**
 * Save version manifest
 */
export async function saveVersionManifest(
  storagePath: string,
  manifest: VersionManifest
): Promise<void> {
  const manifestDir = join(storagePath, 'manifests');
  await mkdir(manifestDir, { recursive: true });

  const manifestPath = join(manifestDir, `${manifest.version}.json`);
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
}

/**
 * Load version manifest
 */
export async function loadVersionManifest(
  storagePath: string,
  version: string
): Promise<VersionManifest | null> {
  const manifestPath = join(storagePath, 'manifests', `${version}.json`);

  if (!existsSync(manifestPath)) {
    return null;
  }

  const content = await readFile(manifestPath, 'utf-8');
  return JSON.parse(content) as VersionManifest;
}
