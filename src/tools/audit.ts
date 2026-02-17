import { createHash } from "node:crypto";

export interface ToolAuditBlobPointer {
  id: string;
  hash: string;
  size_bytes: number;
  mime_type?: string;
}

export interface ToolAuditInjectionScan {
  score: number;
  reasons: string[];
}

export interface ToolAuditRedactionSummary {
  redacted_fields: string[];
}

export interface ToolAuditEvent {
  request_id: string;
  tool_name: string;
  ok: boolean;
  timestamp: string;
  args_redacted: unknown;
  output_hash?: string;
  output_blob?: ToolAuditBlobPointer;
  injection_scan?: ToolAuditInjectionScan;
  redaction?: ToolAuditRedactionSummary;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
  meta?: Record<string, unknown>;
}

export interface ToolAuditLogger {
  append(event: ToolAuditEvent): void | Promise<void>;
}

export class InMemoryToolAuditLogger implements ToolAuditLogger {
  private readonly events: ToolAuditEvent[] = [];

  append(event: ToolAuditEvent): void {
    this.events.push(Object.freeze({ ...event }));
  }

  list(): readonly ToolAuditEvent[] {
    return [...this.events];
  }
}

export function hashToolOutput(value: unknown): string {
  const payload = safeJson(value);
  return createHash("sha256").update(payload).digest("hex");
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
}

