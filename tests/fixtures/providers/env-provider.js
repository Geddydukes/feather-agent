export function createEnvProvider(_options = {}, context = {}) {
  const apiKey = context?.env?.("DASHBOARD_TEST_API_KEY");
  if (!apiKey) {
    throw new Error("Missing DASHBOARD_TEST_API_KEY");
  }
  return {
    id: "env-provider",
    async chat() {
      return { content: '{"final":{"role":"assistant","content":"env-ok"}}' };
    },
  };
}
