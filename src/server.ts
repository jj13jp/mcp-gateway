// src/server.ts
import { Hono } from "hono"
import { cors } from "hono/cors"
import type { McpRegistry } from "./mcp-registry.js"
import { handleMcpMessage } from "./mcp-server.js"

export function createApp(deps: {
	registry: McpRegistry
	corsOrigins: string[]
}): Hono {
	const { registry, corsOrigins } = deps
	const app = new Hono()

	app.use(
		"/mcp",
		cors({
			origin: (o) => (corsOrigins.includes(o) ? o : null),
			allowMethods: ["POST", "OPTIONS"],
			allowHeaders: ["Content-Type"],
			credentials: false,
		}),
	)

	app.post("/mcp", async (c) => {
		const body = await c.req.json()
		const response = await handleMcpMessage(body, registry)
		if (response === null) return new Response(null, { status: 202 })
		return c.json(response)
	})

	return app
}
