/**
 * Babel parser wrapper for JavaScript AST generation
 */

import { parse, ParserOptions } from '@babel/parser';
import type { File, Node } from '@babel/types';
import { readFile } from 'fs/promises';
import { createHash } from 'crypto';

export interface ParseResult {
  ast: File;
  code: string;
  hash: string;
}

const PARSER_OPTIONS: ParserOptions = {
  sourceType: 'module',
  plugins: [
    'jsx',
    'typescript',
    'classProperties',
    'classPrivateProperties',
    'classPrivateMethods',
    'optionalChaining',
    'nullishCoalescingOperator',
    'dynamicImport',
    'exportDefaultFrom',
    'exportNamespaceFrom',
  ],
  errorRecovery: true,
};

/**
 * Parse JavaScript code into AST
 */
export function parseCode(code: string): ParseResult {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 16);

  const ast = parse(code, PARSER_OPTIONS);

  return { ast, code, hash };
}

/**
 * Parse a JavaScript file into AST
 */
export async function parseFile(filePath: string): Promise<ParseResult> {
  const code = await readFile(filePath, 'utf-8');
  return parseCode(code);
}

/**
 * Simple AST cache to avoid re-parsing
 */
const astCache = new Map<string, ParseResult>();

export function parseCodeCached(code: string): ParseResult {
  const hash = createHash('sha256').update(code).digest('hex').slice(0, 16);

  const cached = astCache.get(hash);
  if (cached) return cached;

  const result = parseCode(code);
  astCache.set(hash, result);

  // Limit cache size
  if (astCache.size > 10) {
    const firstKey = astCache.keys().next().value;
    if (firstKey) astCache.delete(firstKey);
  }

  return result;
}

export function clearCache(): void {
  astCache.clear();
}

/**
 * Get source code for a node
 */
export function getNodeSource(code: string, node: Node): string {
  if (!node.start || !node.end) return '';
  return code.slice(node.start, node.end);
}
