import { createAgent } from "legionaire";
const { agent } = await createAgent({ config: new URL("./legionaire.config.json", import.meta.url).pathname });
console.log(await agent.run({ sessionId: "demo", input: { role: "user", content: "Summarise Legionaire in one sentence." } }));
