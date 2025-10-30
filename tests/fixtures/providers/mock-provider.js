export function createMockProvider(options = {}) {
  const responses = Array.isArray(options.responses) ? [...options.responses] : [];
  const defaultResponse = options.defaultResponse ?? '{"final":{"role":"assistant","content":"ok"}}';
  return {
    id: options.id ?? "mock-provider",
    async chat() {
      const content = responses.length > 0 ? responses.shift() : defaultResponse;
      return { content };
    }
  };
}
