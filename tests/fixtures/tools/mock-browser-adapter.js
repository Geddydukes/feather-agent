export function createMockBrowserAdapter(options = {}) {
  const finalUrl = options.finalUrl || "https://example.com/final";
  const title = options.title || "Mock Browser Page";
  const text = options.text || "Mock extracted browser text";
  return {
    async runSession(request) {
      const actions = Array.isArray(request.actions) ? request.actions : [];
      return {
        session_id: request.session_id || "mock-session",
        final_url: finalUrl,
        title,
        text,
        actions: actions.map((action, index) => ({
          index,
          type: action.type,
          status: "ok",
          detail: "mock",
        })),
        metadata: {
          started_url: request.start_url,
        },
      };
    },
  };
}

