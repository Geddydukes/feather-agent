import { createAgent } from "feather-agent";
const { agent } = await createAgent({ config: new URL("./feather.config.json", import.meta.url).pathname });
console.log(await agent.run({ sessionId: "demo", input: { role: "user", content: "Summarise Feather in one sentence." } }));
