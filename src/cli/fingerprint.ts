#!/usr/bin/env node
/**
 * CLI tool to fingerprint functions in a JavaScript file
 */

import { readFile } from 'fs/promises';
import { parseCode } from '../parser/index.js';
import { generateFingerprint } from '../fingerprint/generator.js';
import { inferNameFromAnchors, isThirdPartyFunction } from '../anchors/rules.js';
import type { FunctionNode } from '../anchors/extractor.js';

interface FunctionInfo {
  name: string;
  type: 'declaration' | 'expression' | 'arrow';
  fingerprint: ReturnType<typeof generateFingerprint>;
  inferredName: string | null;
  confidence: number;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: fingerprint <file.js> [--limit N] [--with-anchors] [--json] [--all]');
    console.log('');
    console.log('Options:');
    console.log('  --limit N       Only show first N functions');
    console.log('  --with-anchors  Only show functions with stable anchors');
    console.log('  --json          Output as JSON');
    console.log('  --all           Include third-party library functions (filtered by default)');
    process.exit(1);
  }

  const filePath = args[0];
  const limit = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1]) : Infinity;
  const withAnchorsOnly = args.includes('--with-anchors');
  const jsonOutput = args.includes('--json');
  const includeThirdParty = args.includes('--all');

  const log = jsonOutput ? (...args: any[]) => process.stderr.write(args.join(' ') + '\n') : console.log;
  log(`Parsing ${filePath}...`);
  const code = await readFile(filePath, 'utf-8');
  const { ast } = parseCode(code);
  log('Parsing complete. Extracting functions...');

  const functions: FunctionInfo[] = [];

  // Walk the AST manually to find functions
  walkAST(ast, (node, parent) => {
    if (node.type === 'FunctionDeclaration') {
      const name = (node as any).id?.name ?? '<anonymous>';
      const fp = generateFingerprint(node as FunctionNode, name, code);
      const inferred = inferNameFromAnchors(fp.anchors);

      if (withAnchorsOnly && fp.anchors.length === 0) return;

      functions.push({
        name,
        type: 'declaration',
        fingerprint: fp,
        inferredName: inferred?.name ?? null,
        confidence: inferred?.confidence ?? 0,
      });
    }

    if (node.type === 'FunctionExpression') {
      let name = '<anonymous>';
      if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        name = parent.id.name;
      } else if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'Identifier') {
        name = parent.left.name;
      } else if (parent?.type === 'ObjectProperty' && parent.key?.type === 'Identifier') {
        name = parent.key.name;
      }

      const fp = generateFingerprint(node as FunctionNode, name, code);
      const inferred = inferNameFromAnchors(fp.anchors);

      if (withAnchorsOnly && fp.anchors.length === 0) return;

      functions.push({
        name,
        type: 'expression',
        fingerprint: fp,
        inferredName: inferred?.name ?? null,
        confidence: inferred?.confidence ?? 0,
      });
    }

    if (node.type === 'ArrowFunctionExpression') {
      let name = '<anonymous>';
      if (parent?.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
        name = parent.id.name;
      } else if (parent?.type === 'AssignmentExpression' && parent.left?.type === 'Identifier') {
        name = parent.left.name;
      } else if (parent?.type === 'ObjectProperty' && parent.key?.type === 'Identifier') {
        name = parent.key.name;
      }

      const fp = generateFingerprint(node as FunctionNode, name, code);
      const inferred = inferNameFromAnchors(fp.anchors);

      if (withAnchorsOnly && fp.anchors.length === 0) return;

      functions.push({
        name,
        type: 'arrow',
        fingerprint: fp,
        inferredName: inferred?.name ?? null,
        confidence: inferred?.confidence ?? 0,
      });
    }
  });

  const totalBeforeFilter = functions.length;

  // Filter out third-party library functions unless --all is specified
  const filtered = includeThirdParty
    ? functions
    : functions.filter((f) => !isThirdPartyFunction(f.fingerprint.anchors));

  const thirdPartyCount = totalBeforeFilter - filtered.length;

  log(`Found ${totalBeforeFilter} functions${withAnchorsOnly ? ' with anchors' : ''}`);
  if (!includeThirdParty && thirdPartyCount > 0) {
    log(`Filtered ${thirdPartyCount} third-party library functions (use --all to include)`);
  }
  log(`Showing ${filtered.length} Claude Code functions`);

  // Sort by: has inferred name first, then by anchor count, then by name
  filtered.sort((a, b) => {
    if (a.inferredName && !b.inferredName) return -1;
    if (!a.inferredName && b.inferredName) return 1;
    if (b.fingerprint.anchors.length !== a.fingerprint.anchors.length) {
      return b.fingerprint.anchors.length - a.fingerprint.anchors.length;
    }
    return a.name.localeCompare(b.name);
  });

  const toShow = filtered.slice(0, limit);

  if (jsonOutput) {
    console.log(JSON.stringify(toShow, null, 2));
  } else {
    console.log('');

    for (const fn of toShow) {
      const fp = fn.fingerprint;
      console.log(`--- ${fn.name} (${fn.type}) ---`);
      console.log(`  Hash: ${fp.hash}`);
      console.log(`  Params: ${fp.paramCount}`);
      console.log(`  Nodes: ${fp.nodeCount}, Depth: ${fp.depth}`);
      console.log(`  Control flow: ${fp.controlFlow || '(none)'}`);
      console.log(`  Calls: ${fp.callSignature.slice(0, 5).join(', ') || '(none)'}${fp.callSignature.length > 5 ? '...' : ''}`);

      if (fp.anchors.length > 0) {
        console.log(`  Anchors (${fp.anchors.length}):`);
        for (const anchor of fp.anchors.slice(0, 5)) {
          const truncated = anchor.length > 60 ? anchor.slice(0, 57) + '...' : anchor;
          console.log(`    - "${truncated}"`);
        }
        if (fp.anchors.length > 5) {
          console.log(`    ... and ${fp.anchors.length - 5} more`);
        }
      }

      if (fn.inferredName) {
        console.log(`  INFERRED: ${fn.inferredName} (${(fn.confidence * 100).toFixed(0)}%)`);
      }

      console.log(`  Location: L${fp.location.start.line}-${fp.location.end.line}`);
      console.log('');
    }

    // Summary
    const withInferred = filtered.filter((f) => f.inferredName).length;
    const withAnchors = filtered.filter((f) => f.fingerprint.anchors.length > 0).length;

    console.log('=== Summary ===');
    console.log(`Total functions (after filtering): ${filtered.length}`);
    if (thirdPartyCount > 0) {
      console.log(`Third-party filtered: ${thirdPartyCount}`);
    }
    console.log(`With anchors: ${withAnchors} (${((withAnchors / filtered.length) * 100).toFixed(1)}%)`);
    console.log(`Auto-named: ${withInferred} (${((withInferred / filtered.length) * 100).toFixed(1)}%)`);
  }
}

/**
 * Walk the AST and call callback for each node
 */
function walkAST(node: any, callback: (node: any, parent: any) => void, parent: any = null): void {
  if (!node || typeof node !== 'object') return;

  callback(node, parent);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;

    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && item.type) {
          walkAST(item, callback, node);
        }
      }
    } else if (value && typeof value === 'object' && value.type) {
      walkAST(value, callback, node);
    }
  }
}

main().catch(console.error);
