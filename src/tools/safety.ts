export interface RedactionResult {
  value: unknown;
  redactedFields: string[];
}

export interface PromptInjectionScanResult {
  score: number;
  reasons: string[];
}

export interface PromptInjectionScanner {
  scan(content: unknown): PromptInjectionScanResult;
}

const REDACTED = "[REDACTED]";
const SENSITIVE_KEY_PATTERN = /(api[_-]?key|token|secret|password|authorization|cookie|session)/i;
const INJECTION_PATTERNS: Array<{ pattern: RegExp; reason: string; weight: number }> = [
  { pattern: /ignore\s+previous\s+instructions?/i, reason: "ignore-previous-instructions", weight: 0.45 },
  { pattern: /system\s+prompt/i, reason: "system-prompt-exfiltration", weight: 0.4 },
  { pattern: /developer\s+message/i, reason: "developer-message-exfiltration", weight: 0.35 },
  { pattern: /reveal\s+(all|your)\s+secrets?/i, reason: "secret-exfiltration-request", weight: 0.35 },
  { pattern: /disable\s+safety|bypass\s+guardrails?/i, reason: "safety-bypass-attempt", weight: 0.5 },
];

export function applyRedaction(input: unknown): RedactionResult {
  const fields: string[] = [];
  const visited = new Set<unknown>();
  const value = redactRecursive(input, "$", fields, visited);
  return {
    value,
    redactedFields: fields,
  };
}

export class DefaultPromptInjectionScanner implements PromptInjectionScanner {
  scan(content: unknown): PromptInjectionScanResult {
    const text = flattenToText(content).toLowerCase();
    if (!text) {
      return { score: 0, reasons: [] };
    }
    let score = 0;
    const reasons: string[] = [];
    for (const candidate of INJECTION_PATTERNS) {
      if (!candidate.pattern.test(text)) {
        continue;
      }
      score += candidate.weight;
      reasons.push(candidate.reason);
    }
    return {
      score: Math.min(1, Number(score.toFixed(2))),
      reasons,
    };
  }
}

function redactRecursive(
  input: unknown,
  path: string,
  fields: string[],
  visited: Set<unknown>
): unknown {
  if (!input || typeof input !== "object") {
    return input;
  }
  if (visited.has(input)) {
    return "[Circular]";
  }
  visited.add(input);

  if (Array.isArray(input)) {
    return input.map((entry, index) => redactRecursive(entry, `${path}[${index}]`, fields, visited));
  }

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const childPath = `${path}.${key}`;
    if (SENSITIVE_KEY_PATTERN.test(key)) {
      out[key] = REDACTED;
      fields.push(childPath);
      continue;
    }
    out[key] = redactRecursive(value, childPath, fields, visited);
  }
  return out;
}

function flattenToText(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map(flattenToText).join("\n");
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).map(flattenToText).join("\n");
  }
  return "";
}

