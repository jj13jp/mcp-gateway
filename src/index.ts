// src/index.ts
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createLlamaClient } from "./llama-client.js";
import { McpRegistry } from "./mcp-registry.js";
import { createApp } from "./server.js";

async function main() {
	const config = loadConfig();
	const registry = await McpRegistry.start(config.servers);
	const llama = createLlamaClient(config.llamaBaseUrl);
	const app = createApp({
		registry,
		llama,
		maxToolIterations: config.maxToolIterations,
	});

	const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
		console.log(`mcp-gateway listening on :${info.port}`);
	});

	const shutdown = async () => {
		await registry.close();
		server.close();
		process.exit(0);
	};
	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
