/**
 * Extract stable anchors from function AST nodes
 */

import type { Node, FunctionDeclaration, FunctionExpression, ArrowFunctionExpression } from '@babel/types';
import type { Anchor } from '../store/schema.js';
import { isStableString } from './rules.js';

export type FunctionNode = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression;

/**
 * Extract all anchors from a function node by walking its body
 */
export function extractAnchors(functionNode: FunctionNode, code: string): Anchor[] {
  const anchors: Anchor[] = [];

  // Walk the function body recursively
  walkNode(functionNode.body, (node, parent) => {
    // String literals
    if (node.type === 'StringLiteral') {
      const value = (node as any).value;
      if (isStableString(value)) {
        anchors.push({
          type: 'string',
          value,
          context: getParentContext(parent),
        });
      }
    }

    // Template literals (static only)
    if (node.type === 'TemplateLiteral') {
      const tl = node as any;
      if (tl.expressions.length === 0 && tl.quasis.length === 1) {
        const value = tl.quasis[0].value.raw;
        if (isStableString(value)) {
          anchors.push({
            type: 'string',
            value,
            context: getParentContext(parent),
          });
        }
      }
    }

    // Environment variable access: process.env.X
    if (node.type === 'MemberExpression') {
      if (isEnvAccess(node)) {
        const envName = getEnvVarName(node);
        if (envName) {
          anchors.push({
            type: 'env',
            value: envName,
            context: 'process.env',
          });
        }
      }
    }
  });

  return anchors;
}

/**
 * Walk all nodes in an AST subtree
 */
function walkNode(node: any, callback: (node: any, parent: any) => void, parent: any = null): void {
  if (!node || typeof node !== 'object') return;

  callback(node, parent);

  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'start' || key === 'end' || key === 'range') continue;

    const value = node[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && item.type) {
          walkNode(item, callback, node);
        }
      }
    } else if (value && typeof value === 'object' && value.type) {
      walkNode(value, callback, node);
    }
  }
}

/**
 * Check if a MemberExpression is process.env.X
 */
function isEnvAccess(node: any): boolean {
  if (node.type !== 'MemberExpression') return false;

  const obj = node.object;
  if (obj?.type !== 'MemberExpression') return false;

  return (
    obj.object?.type === 'Identifier' &&
    obj.object?.name === 'process' &&
    obj.property?.type === 'Identifier' &&
    obj.property?.name === 'env'
  );
}

/**
 * Get environment variable name from process.env.X
 */
function getEnvVarName(node: any): string | null {
  if (!isEnvAccess(node)) return null;

  const prop = node.property;
  if (prop.type === 'Identifier') {
    return prop.name;
  }
  if (prop.type === 'StringLiteral') {
    return prop.value;
  }
  return null;
}

/**
 * Get context from parent node for anchor
 */
function getParentContext(parent: any): string {
  if (!parent) return 'unknown';

  switch (parent.type) {
    case 'CallExpression':
      const callee = parent.callee;
      if (callee?.type === 'Identifier') {
        return `arg:${callee.name}`;
      }
      if (callee?.type === 'MemberExpression' && callee.property?.type === 'Identifier') {
        return `arg:${callee.property.name}`;
      }
      return 'arg:call';

    case 'VariableDeclarator':
      if (parent.id?.type === 'Identifier') {
        return `assign:${parent.id.name}`;
      }
      return 'assign';

    case 'ReturnStatement':
      return 'return';

    case 'BinaryExpression':
      return `binop:${parent.operator}`;

    case 'ConditionalExpression':
      return 'conditional';

    case 'ObjectProperty':
      if (parent.key?.type === 'Identifier') {
        return `property:${parent.key.name}`;
      }
      return 'property';

    default:
      return parent.type;
  }
}

/**
 * Extract unique anchor values (deduplicated)
 */
export function extractUniqueAnchorValues(functionNode: FunctionNode, code: string): string[] {
  const anchors = extractAnchors(functionNode, code);
  const values = new Set(anchors.map((a) => a.value));
  return Array.from(values).sort();
}
