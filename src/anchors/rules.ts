/**
 * Rules for identifying stable anchors and inferring names
 */

import type { AnchorRule } from '../store/schema.js';

/**
 * Patterns that indicate a stable string anchor
 */
export const STABLE_STRING_PATTERNS = [
  // Metric names
  /^claude_code\./,
  /^anthropic\./,

  // Environment variables
  /^CLAUDE_/,
  /^VERTEX_/,
  /^ANTHROPIC_/,

  // URLs
  /^https?:\/\//,

  // Object type checks
  /^\[object \w+\]$/,

  // Error messages (heuristic: contains common error words)
  /\b(error|invalid|failed|cannot|could not|unexpected|missing)\b/i,

  // System prompts
  /^You are /,
];

/**
 * Minimum length for a string to be considered as anchor
 */
export const MIN_ANCHOR_LENGTH = 10;

/**
 * Known anchor patterns that map to function names
 */
export const ANCHOR_NAME_RULES: AnchorRule[] = [
  // Configuration
  {
    pattern: 'CLAUDE_CONFIG_DIR',
    isRegex: false,
    suggestedName: 'getClaudeConfigDir',
    confidence: 0.95,
    description: 'Claude configuration directory',
  },
  {
    pattern: 'CLAUDE_BASH_MAINTAIN_PROJECT_WORKING_DIR',
    isRegex: false,
    suggestedName: 'shouldMaintainProjectWorkingDir',
    confidence: 0.9,
    description: 'Bash working directory setting',
  },

  // Metrics
  {
    pattern: 'claude_code.session.count',
    isRegex: false,
    suggestedName: 'getSessionCounter',
    confidence: 0.95,
    description: 'Session count metric',
  },
  {
    pattern: 'claude_code.lines_of_code.count',
    isRegex: false,
    suggestedName: 'getLinesOfCodeCounter',
    confidence: 0.95,
    description: 'Lines of code metric',
  },
  {
    pattern: 'claude_code.pull_request.count',
    isRegex: false,
    suggestedName: 'getPullRequestCounter',
    confidence: 0.95,
    description: 'Pull request count metric',
  },
  {
    pattern: 'claude_code.commit.count',
    isRegex: false,
    suggestedName: 'getCommitCounter',
    confidence: 0.95,
    description: 'Commit count metric',
  },
  {
    pattern: 'claude_code.cost.usage',
    isRegex: false,
    suggestedName: 'getCostCounter',
    confidence: 0.95,
    description: 'Cost usage metric',
  },
  {
    pattern: 'claude_code.token.usage',
    isRegex: false,
    suggestedName: 'getTokenCounter',
    confidence: 0.95,
    description: 'Token usage metric',
  },
  {
    pattern: 'claude_code.code_edit_tool.decision',
    isRegex: false,
    suggestedName: 'getCodeEditDecisionCounter',
    confidence: 0.95,
    description: 'Code edit tool decision metric',
  },
  {
    pattern: 'claude_code.active_time.total',
    isRegex: false,
    suggestedName: 'getActiveTimeCounter',
    confidence: 0.95,
    description: 'Active time metric',
  },

  // API URLs
  {
    pattern: 'https://api.anthropic.com',
    isRegex: false,
    suggestedName: 'getAnthropicApiUrl',
    confidence: 0.9,
    description: 'Anthropic API base URL',
  },
  {
    pattern: 'api/oauth/claude_cli/create_api_key',
    isRegex: false,
    suggestedName: 'getCreateApiKeyUrl',
    confidence: 0.9,
    description: 'OAuth API key creation endpoint',
  },
  {
    pattern: 'api/oauth/claude_cli/roles',
    isRegex: false,
    suggestedName: 'getRolesUrl',
    confidence: 0.9,
    description: 'OAuth roles endpoint',
  },

  // System prompts
  {
    pattern: 'You are Claude Code, Anthropic',
    isRegex: false,
    suggestedName: 'getSystemPrompt',
    confidence: 0.95,
    description: 'Main system prompt',
  },
  {
    pattern: 'You are a Claude agent',
    isRegex: false,
    suggestedName: 'getAgentSystemPrompt',
    confidence: 0.9,
    description: 'Agent SDK system prompt',
  },

  // Model names (regex patterns)
  {
    pattern: '^VERTEX_REGION_CLAUDE_',
    isRegex: true,
    suggestedName: 'getVertexRegion',
    confidence: 0.85,
    description: 'Vertex AI region configuration',
  },
  {
    pattern: '^anthropic\\.claude-',
    isRegex: true,
    suggestedName: 'getModelId',
    confidence: 0.8,
    description: 'Model identifier',
  },

  // Error handling
  {
    pattern: 'Invalid renderer id',
    isRegex: false,
    suggestedName: 'handleInvalidRendererId',
    confidence: 0.7,
    description: 'React DevTools renderer validation',
  },
  {
    pattern: 'Could not find Fiber',
    isRegex: false,
    suggestedName: 'findFiber',
    confidence: 0.7,
    description: 'React Fiber lookup',
  },
];

/**
 * Check if a string matches stable anchor patterns
 */
export function isStableString(value: string): boolean {
  if (value.length < MIN_ANCHOR_LENGTH) return false;

  return STABLE_STRING_PATTERNS.some((pattern) => pattern.test(value));
}

/**
 * Find matching anchor rule for a value
 */
export function findMatchingRule(value: string): AnchorRule | null {
  for (const rule of ANCHOR_NAME_RULES) {
    if (rule.isRegex) {
      const regex = new RegExp(rule.pattern);
      if (regex.test(value)) return rule;
    } else {
      if (value.includes(rule.pattern)) return rule;
    }
  }
  return null;
}

/**
 * Infer function name from anchors
 */
export function inferNameFromAnchors(anchors: string[]): { name: string; confidence: number } | null {
  for (const anchor of anchors) {
    const rule = findMatchingRule(anchor);
    if (rule) {
      return { name: rule.suggestedName, confidence: rule.confidence };
    }
  }
  return null;
}
