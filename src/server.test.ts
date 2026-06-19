// src/server.test.ts
import { expect, test, vi } from "vitest";
import type { McpRegistry } from "./mcp-registry.js";
import { createApp } from "./server.js";

function fakeRegistry(): McpRegistry {
	return {
		listTools: () =>
			new Map([
				[
					"filesystem",
					[
						{
							name: "read_file",
							description: "read",
							inputSchema: { type: "object" },
						},
					],
				],
			]),
		callTool: vi.fn().mockResolvedValue("world"),
		close: vi.fn(),
	} as unknown as McpRegistry;
}

test("POST /v1/chat/completions が最終回答を返す", async () => {
	const llama = {
		chat: vi
			.fn()
			.mockResolvedValueOnce({
				choices: [
					{
						message: {
							role: "assistant",
							content: null,
							tool_calls: [
								{
									id: "c1",
									type: "function",
									function: {
										name: "filesystem__read_file",
										arguments: '{"path":"/data/x"}',
									},
								},
							],
						},
						finish_reason: "tool_calls",
					},
				],
			})
			.mockResolvedValueOnce({
				choices: [
					{
						message: { role: "assistant", content: "worldでした" },
						finish_reason: "stop",
					},
				],
			}),
	};

	const app = createApp({
		registry: fakeRegistry(),
		llama,
		maxToolIterations: 5,
	});
	const res = await app.request("/v1/chat/completions", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			model: "local",
			messages: [{ role: "user", content: "read_fileで読んで" }],
		}),
	});

	expect(res.status).toBe(200);
	const json = await res.json();
	expect(json.choices[0].message.content).toBe("worldでした");
	// 名指し(read_file)で初回 tool_choice が固定されること
	expect(llama.chat.mock.calls[0][0].tool_choice).toEqual({
		type: "function",
		function: { name: "filesystem__read_file" },
	});
});
