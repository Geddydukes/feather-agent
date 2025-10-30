export interface CapturedTool {
  name: string;
  description?: string;
  inputSchema?: unknown;
}

export function resetCapturePlannerState(): void;
export function getCapturePlannerTools(): CapturedTool[] | undefined;
export default function createCapturePlanner(
  options: unknown,
  context?: { tools?: CapturedTool[] }
): () => Promise<{ final: { role: "assistant"; content: string } }>;
