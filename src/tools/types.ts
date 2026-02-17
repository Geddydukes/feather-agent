import type { ToolManifest } from "./manifest.js";

export interface ToolRunContext {
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;
}

export interface Tool<Args = any, Result = unknown> {
  name: string;
  description: string;
  manifest?: ToolManifest;
  cacheTtlSec?: number;
  run(args: Args, ctx: ToolRunContext): Promise<Result> | Result;
}
