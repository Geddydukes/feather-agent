let lastTools = undefined;

export function resetCapturePlannerState() {
  lastTools = undefined;
}

export function getCapturePlannerTools() {
  return lastTools;
}

export default function createCapturePlanner(_options, context) {
  lastTools = Array.isArray(context?.tools)
    ? context.tools.map((tool) => ({ ...tool }))
    : undefined;

  return async () => ({
    final: { role: "assistant", content: "captured" }
  });
}
