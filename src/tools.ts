import type { Tool } from "@modelcontextprotocol/sdk/types.js"

export const TOOL_NAME_SEP = "__"

export interface OpenAITool {
	type: "function"
	function: {
		name: string
		description?: string
		parameters: Record<string, unknown>
	}
}

export function qualifyToolName(server: string, tool: string): string {
	return `${server}${TOOL_NAME_SEP}${tool}`
}

export function parseToolName(qualified: string): {
	server: string
	tool: string
} {
	const idx = qualified.indexOf(TOOL_NAME_SEP)
	if (idx === -1)
		throw new Error(`ツール名にセパレータがありません: ${qualified}`)
	return {
		server: qualified.slice(0, idx),
		tool: qualified.slice(idx + TOOL_NAME_SEP.length),
	}
}

export function toOpenAITools(
	toolsByServer: Map<string, Tool[]>,
): OpenAITool[] {
	const out: OpenAITool[] = []
	for (const [server, tools] of toolsByServer) {
		for (const tool of tools) {
			out.push({
				type: "function",
				function: {
					name: qualifyToolName(server, tool.name),
					description: tool.description,
					parameters: (tool.inputSchema as Record<string, unknown>) ?? {
						type: "object",
					},
				},
			})
		}
	}
	return out
}
