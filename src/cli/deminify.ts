#!/usr/bin/env node
/**
 * Deminify JavaScript by replacing minified names with inferred semantic names
 */

import { readFile, writeFile } from 'fs/promises';
import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';

// Handle ESM/CJS interop
const traverse = (_traverse as any).default || _traverse;
const generate = (_generate as any).default || _generate;

interface FingerprintEntry {
  name: string;
  type: string;
  inferredName: string | null;
  confidence: number;
  fingerprint: {
    hash: string;
    minifiedName: string;
    location: {
      start: { line: number; column: number };
      end: { line: number; column: number };
    };
  };
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('Usage: deminify <source.js> <fingerprints.json> [output.js]');
    console.error('');
    console.error('Replaces minified function names with inferred semantic names.');
    console.error('If output.js is not specified, prints to stdout.');
    process.exit(1);
  }

  const sourcePath = args[0];
  const fingerprintPath = args[1];
  const outputPath = args[2];

  console.error(`Loading fingerprints from ${fingerprintPath}...`);
  const fingerprintData: FingerprintEntry[] = JSON.parse(
    await readFile(fingerprintPath, 'utf-8')
  );

  // Build mapping: minifiedName -> inferredName
  // Only include functions with inferred names and confidence >= 0.8
  const nameMap = new Map<string, string>();
  const locationMap = new Map<string, string>(); // "line:col" -> inferredName

  for (const entry of fingerprintData) {
    if (entry.inferredName && entry.confidence >= 0.8) {
      const minName = entry.name;
      const semName = entry.inferredName;

      // Skip anonymous functions for direct name mapping
      if (minName !== '<anonymous>') {
        // If multiple functions map to same inferred name, make them unique
        if (nameMap.has(minName)) {
          // Already mapped, skip (first wins)
          continue;
        }
        nameMap.set(minName, semName);
      }

      // Also store by location for anonymous functions
      const loc = entry.fingerprint.location;
      const locKey = `${loc.start.line}:${loc.start.column}`;
      locationMap.set(locKey, semName);
    }
  }

  console.error(`Built mapping: ${nameMap.size} named functions, ${locationMap.size} by location`);

  console.error(`Parsing ${sourcePath}...`);
  const source = await readFile(sourcePath, 'utf-8');

  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
    errorRecovery: true,
  });

  console.error('Transforming AST...');

  // Track renames for updating references
  const renamedIdentifiers = new Set<string>();

  // First pass: rename function declarations and expressions
  traverse(ast, {
    // Function declarations: function foo() {}
    FunctionDeclaration(path) {
      if (path.node.id && nameMap.has(path.node.id.name)) {
        const oldName = path.node.id.name;
        const newName = nameMap.get(oldName)!;
        console.error(`  Renaming function ${oldName} -> ${newName}`);
        path.scope.rename(oldName, newName);
        renamedIdentifiers.add(newName);
      }
    },

    // Variable declarations: const foo = function() {} or const foo = () => {}
    VariableDeclarator(path) {
      if (
        path.node.id.type === 'Identifier' &&
        (path.node.init?.type === 'FunctionExpression' ||
          path.node.init?.type === 'ArrowFunctionExpression')
      ) {
        const oldName = path.node.id.name;
        if (nameMap.has(oldName)) {
          const newName = nameMap.get(oldName)!;
          console.error(`  Renaming variable ${oldName} -> ${newName}`);
          path.scope.rename(oldName, newName);
          renamedIdentifiers.add(newName);
        }
      }
    },

    // Object properties: { foo: function() {} }
    ObjectProperty(path) {
      if (
        path.node.key.type === 'Identifier' &&
        (path.node.value.type === 'FunctionExpression' ||
          path.node.value.type === 'ArrowFunctionExpression')
      ) {
        const oldName = path.node.key.name;
        if (nameMap.has(oldName)) {
          const newName = nameMap.get(oldName)!;
          console.error(`  Renaming property ${oldName} -> ${newName}`);
          // Can't use scope.rename for object properties, rename key directly
          path.node.key.name = newName;
        }
      }
    },

    // Object methods: { foo() {} }
    ObjectMethod(path) {
      if (path.node.key.type === 'Identifier') {
        const oldName = path.node.key.name;
        if (nameMap.has(oldName)) {
          const newName = nameMap.get(oldName)!;
          console.error(`  Renaming method ${oldName} -> ${newName}`);
          path.node.key.name = newName;
        }
      }
    },

    // Class methods
    ClassMethod(path) {
      if (path.node.key.type === 'Identifier') {
        const oldName = path.node.key.name;
        if (nameMap.has(oldName)) {
          const newName = nameMap.get(oldName)!;
          console.error(`  Renaming class method ${oldName} -> ${newName}`);
          path.node.key.name = newName;
        }
      }
    },
  });

  console.error('Generating output...');

  const output = generate(ast, {
    retainLines: true,
    compact: false,
  });

  if (outputPath) {
    await writeFile(outputPath, output.code);
    console.error(`Written to ${outputPath}`);
  } else {
    console.log(output.code);
  }

  console.error(`Done. Renamed ${renamedIdentifiers.size} functions.`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
