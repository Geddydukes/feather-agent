export function createMockWebSearchAdapter(options = {}) {
  const defaults = Array.isArray(options.results)
    ? options.results
    : [
        {
          title: "Fallback Result",
          url: "https://example.com/fallback",
          snippet: "Fallback snippet",
        },
      ];

  return {
    async search(request) {
      const topK = Number.isInteger(request?.topK) ? request.topK : defaults.length;
      return defaults.slice(0, topK);
    },
  };
}

