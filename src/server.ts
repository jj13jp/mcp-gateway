// src/server.ts
import { Hono } from "hono"
import type { ChatMessage, LlamaClient } from "./agent-loop.js"
import { runAgentLoop } from "./agent-loop.js"
import type { McpRegistry } from "./mcp-registry.js"
import { resolveToolChoice } from "./tool-choice.js"
import { parseToolName, toOpenAITools } from "./tools.js"

export function createApp(deps: {
	registry: McpRegistry
	llama: LlamaClient
	maxToolIterations: number
}): Hono {
	const { registry, llama, maxToolIterations } = deps
	const app = new Hono()

	app.post("/v1/chat/completions", async (c) => {
		const body = await c.req.json<{ messages: ChatMessage[] }>()
		const tools = toOpenAITools(registry.listTools())
		const toolNames = tools.map((t) => t.function.name)

		const lastUser = [...body.messages].reverse().find((m) => m.role === "user")
		const toolChoice = resolveToolChoice(lastUser?.content ?? "", toolNames)

		const executeTool = async (
			qualified: string,
			args: Record<string, unknown>,
		) => {
			const { server, tool } = parseToolName(qualified)
			return registry.callTool(server, tool, args)
		}

		const result = await runAgentLoop({
			messages: body.messages,
			tools,
			toolChoice,
			llama,
			executeTool,
			maxIterations: maxToolIterations,
		})

		return c.json(result)
	})

	return app
}
