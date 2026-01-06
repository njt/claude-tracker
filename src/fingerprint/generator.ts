/**
 * Generate structural fingerprints for functions
 */

import { createHash } from 'crypto';
import type { FunctionFingerprint } from '../store/schema.js';
import type { FunctionNode } from '../anchors/extractor.js';
import { extractUniqueAnchorValues } from '../anchors/extractor.js';

/**
 * Generate a fingerprint for a function node
 */
export function generateFingerprint(
  functionNode: FunctionNode,
  minifiedName: string,
  code: string
): FunctionFingerprint {
  const anchors = extractUniqueAnchorValues(functionNode, code);
  const paramCount = getParamCount(functionNode);
  const callSignature = extractCallSignature(functionNode);
  const controlFlow = extractControlFlow(functionNode);
  const { nodeCount, depth } = computeStructuralMetrics(functionNode);

  const hash = computeHash({
    anchors,
    paramCount,
    callSignature,
    controlFlow,
    nodeCount,
  });

  return {
    hash,
    minifiedName,
    anchors,
    paramCount,
    callSignature,
    controlFlow,
    nodeCount,
    depth,
    location: {
      start: {
        line: functionNode.loc?.start.line ?? 0,
        column: functionNode.loc?.start.column ?? 0,
      },
      end: {
        line: functionNode.loc?.end.line ?? 0,
        column: functionNode.loc?.end.column ?? 0,
      },
    },
  };
}

/**
 * Get parameter count from function node
 */
function getParamCount(node: FunctionNode): number {
  return node.params?.length ?? 0;
}

/**
 * Walk all nodes in an AST subtree
 */
function walkNode(node: any, callback: (node: any) => void): void {
  if (!node || typeof node !== 'object') return;

  callback(node);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;

    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && item.type) {
          walkNode(item, callback);
        }
      }
    } else if (value && typeof value === 'object' && value.type) {
      walkNode(value, callback);
    }
  }
}

/**
 * Extract normalized call signatures
 */
function extractCallSignature(functionNode: FunctionNode): string[] {
  const calls: string[] = [];

  walkNode(functionNode.body, (node) => {
    if (node.type === 'CallExpression') {
      const sig = normalizeCallSignature(node);
      if (sig) calls.push(sig);
    }
  });

  return calls.sort();
}

/**
 * Normalize a call expression to a signature
 */
function normalizeCallSignature(node: any): string | null {
  const callee = node.callee;

  // Method call: obj.method()
  if (callee?.type === 'MemberExpression') {
    const obj = callee.object;
    const prop = callee.property;

    // Known globals: console, process, Math, JSON, etc.
    if (obj?.type === 'Identifier') {
      const knownGlobals = ['console', 'process', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number', 'Date'];
      if (knownGlobals.includes(obj.name)) {
        const method = prop?.type === 'Identifier' ? prop.name : '$method';
        return `${obj.name}.${method}`;
      }
    }

    // Chained call: obj.property.method()
    if (obj?.type === 'MemberExpression') {
      // process.env.X access
      if (
        obj.object?.type === 'Identifier' &&
        obj.object?.name === 'process' &&
        obj.property?.type === 'Identifier' &&
        obj.property?.name === 'env'
      ) {
        return 'process.env.$prop';
      }
    }

    // Generic method call
    return '$obj.$method';
  }

  // Direct function call
  if (callee?.type === 'Identifier') {
    // Check for known built-ins
    const builtIns = ['require', 'import', 'setTimeout', 'setInterval', 'Promise', 'fetch'];
    if (builtIns.includes(callee.name)) {
      return callee.name;
    }
    return '$call';
  }

  // IIFE or other
  return '$expr()';
}

/**
 * Extract control flow pattern
 */
function extractControlFlow(functionNode: FunctionNode): string {
  const patterns: string[] = [];

  walkNode(functionNode.body, (node) => {
    switch (node.type) {
      case 'IfStatement':
        patterns.push('if');
        break;
      case 'ForStatement':
        patterns.push('for');
        break;
      case 'ForInStatement':
        patterns.push('forin');
        break;
      case 'ForOfStatement':
        patterns.push('forof');
        break;
      case 'WhileStatement':
        patterns.push('while');
        break;
      case 'DoWhileStatement':
        patterns.push('dowhile');
        break;
      case 'TryStatement':
        patterns.push('try');
        break;
      case 'SwitchStatement':
        patterns.push('switch');
        break;
      case 'ReturnStatement':
        const arg = node.argument;
        if (!arg) {
          patterns.push('return-void');
        } else if (arg.type === 'ConditionalExpression') {
          patterns.push('return-ternary');
        } else if (arg.type === 'LogicalExpression') {
          if (arg.operator === '??') patterns.push('return-nullish');
          else if (arg.operator === '||') patterns.push('return-or');
          else if (arg.operator === '&&') patterns.push('return-and');
        } else {
          patterns.push('return');
        }
        break;
      case 'ThrowStatement':
        patterns.push('throw');
        break;
      case 'AwaitExpression':
        patterns.push('await');
        break;
      case 'YieldExpression':
        patterns.push('yield');
        break;
    }
  });

  return patterns.sort().join(',');
}

/**
 * Compute structural metrics: node count and max depth
 */
function computeStructuralMetrics(functionNode: FunctionNode): { nodeCount: number; depth: number } {
  let nodeCount = 0;
  let maxDepth = 0;

  function walk(node: any, currentDepth: number): void {
    if (!node || typeof node !== 'object') return;

    nodeCount++;
    maxDepth = Math.max(maxDepth, currentDepth);

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;

      const value = node[key];
      if (Array.isArray(value)) {
        for (const item of value) {
          walk(item, currentDepth + 1);
        }
      } else if (value && typeof value === 'object' && value.type) {
        walk(value, currentDepth + 1);
      }
    }
  }

  walk(functionNode, 0);

  return { nodeCount, depth: maxDepth };
}

/**
 * Compute hash from fingerprint components
 */
function computeHash(components: {
  anchors: string[];
  paramCount: number;
  callSignature: string[];
  controlFlow: string;
  nodeCount: number;
}): string {
  const input = [
    components.anchors.join('|'),
    components.paramCount.toString(),
    components.callSignature.join(','),
    components.controlFlow,
    // Bucket node count to allow small variations
    Math.floor(components.nodeCount / 10).toString(),
  ].join('::');

  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

/**
 * Compare two fingerprints and return similarity score (0-1)
 */
export function compareFingerprintSimilarity(a: FunctionFingerprint, b: FunctionFingerprint): number {
  let score = 0;
  let weights = 0;

  // Anchor overlap (highest weight)
  const anchorOverlap = computeSetOverlap(a.anchors, b.anchors);
  score += anchorOverlap * 0.4;
  weights += 0.4;

  // Param count match
  if (a.paramCount === b.paramCount) {
    score += 0.15;
  }
  weights += 0.15;

  // Call signature overlap
  const callOverlap = computeSetOverlap(a.callSignature, b.callSignature);
  score += callOverlap * 0.2;
  weights += 0.2;

  // Control flow match
  if (a.controlFlow === b.controlFlow) {
    score += 0.15;
  } else {
    // Partial match for similar control flow
    const aPatterns = new Set(a.controlFlow.split(','));
    const bPatterns = new Set(b.controlFlow.split(','));
    const cfOverlap = computeSetOverlap(Array.from(aPatterns), Array.from(bPatterns));
    score += cfOverlap * 0.1;
  }
  weights += 0.15;

  // Node count similarity (allow 20% variance)
  const nodeDiff = Math.abs(a.nodeCount - b.nodeCount);
  const maxNodes = Math.max(a.nodeCount, b.nodeCount);
  if (maxNodes > 0) {
    const nodeSimilarity = Math.max(0, 1 - nodeDiff / maxNodes);
    score += nodeSimilarity * 0.1;
  }
  weights += 0.1;

  return score / weights;
}

/**
 * Compute Jaccard similarity for two string arrays
 */
function computeSetOverlap(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
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
