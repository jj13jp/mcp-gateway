import type { McpRegistry } from "./mcp-registry.js"
import { parseToolName, qualifyToolName } from "./tools.js"

interface JsonRpcRequest {
	jsonrpc: "2.0"
	id: string | number
	method: string
	params?: unknown
}

interface JsonRpcNotification {
	jsonrpc: "2.0"
	method: string
	params?: unknown
}

type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification

type JsonRpcResponse =
	| { jsonrpc: "2.0"; id: string | number; result: unknown }
	| {
			jsonrpc: "2.0"
			id: string | number
			error: { code: number; message: string }
	  }

function isRequest(msg: JsonRpcMessage): msg is JsonRpcRequest {
	return "id" in msg
}

export async function handleMcpMessage(
	msg: JsonRpcMessage,
	registry: McpRegistry,
): Promise<JsonRpcResponse | null> {
	if (!isRequest(msg)) return null

	const { id, method, params } = msg

	switch (method) {
		case "initialize":
			return {
				jsonrpc: "2.0",
				id,
				result: {
					protocolVersion: "2024-11-05",
					capabilities: { tools: {} },
					serverInfo: { name: "mcp-gateway", version: "0.1.0" },
				},
			}

		case "tools/list": {
			const tools: unknown[] = []
			for (const [server, serverTools] of registry.listTools()) {
				for (const tool of serverTools) {
					tools.push({
						name: qualifyToolName(server, tool.name),
						description: tool.description,
						inputSchema: tool.inputSchema,
					})
				}
			}
			return { jsonrpc: "2.0", id, result: { tools } }
		}

		case "tools/call": {
			const p = params as {
				name: string
				arguments?: Record<string, unknown>
			}
			try {
				const { server, tool } = parseToolName(p.name)
				const text = await registry.callTool(server, tool, p.arguments ?? {})
				return {
					jsonrpc: "2.0",
					id,
					result: { content: [{ type: "text", text }] },
				}
			} catch (e) {
				return {
					jsonrpc: "2.0",
					id,
					error: { code: -32603, message: (e as Error).message },
				}
			}
		}

		default:
			return {
				jsonrpc: "2.0",
				id,
				error: { code: -32601, message: `Method not found: ${method}` },
			}
	}
}
