import type { ToolChoice } from "./tool-choice.js";
import type { OpenAITool } from "./tools.js";

export interface ToolCall {
	id: string;
	type: "function";
	function: { name: string; arguments: string };
}

export interface ChatMessage {
	role: string;
	content: string | null;
	tool_calls?: ToolCall[];
	tool_call_id?: string;
	name?: string;
}

export interface ChatCompletion {
	choices: { message: ChatMessage; finish_reason: string }[];
}

export interface LlamaClient {
	chat(req: {
		messages: ChatMessage[];
		tools: OpenAITool[];
		tool_choice: ToolChoice;
	}): Promise<ChatCompletion>;
}

export type ExecuteTool = (
	qualifiedName: string,
	args: Record<string, unknown>,
) => Promise<string>;

export async function runAgentLoop(params: {
	messages: ChatMessage[];
	tools: OpenAITool[];
	toolChoice: ToolChoice;
	llama: LlamaClient;
	executeTool: ExecuteTool;
	maxIterations: number;
}): Promise<ChatCompletion> {
	const { tools, llama, executeTool, maxIterations } = params;
	const messages = [...params.messages];
	let toolChoice = params.toolChoice;
	let last: ChatCompletion | undefined;

	for (let i = 0; i < maxIterations; i++) {
		const completion = await llama.chat({
			messages,
			tools,
			tool_choice: toolChoice,
		});
		last = completion;
		toolChoice = "auto";

		const message = completion.choices[0]?.message;
		const calls = message?.tool_calls;
		if (!message || !calls || calls.length === 0) {
			return completion;
		}

		messages.push(message);
		for (const call of calls) {
			let args: Record<string, unknown> = {};
			try {
				args = call.function.arguments
					? JSON.parse(call.function.arguments)
					: {};
			} catch {
				args = {};
			}
			const result = await executeTool(call.function.name, args);
			messages.push({ role: "tool", tool_call_id: call.id, content: result });
		}
	}

	// biome-ignore lint/style/noNonNullAssertion: ループは必ず1回以上 last を設定する
	return last!;
}
