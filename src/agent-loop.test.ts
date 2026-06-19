import { expect, test, vi } from "vitest";
import {
	type ChatCompletion,
	type LlamaClient,
	runAgentLoop,
} from "./agent-loop.js";

function completion(
	message: ChatCompletion["choices"][0]["message"],
	finish = "stop",
): ChatCompletion {
	return { choices: [{ message, finish_reason: finish }] };
}

test("tool_calls→実行→最終回答のループ", async () => {
	const llama: LlamaClient = {
		chat: vi
			.fn()
			.mockResolvedValueOnce(
				completion(
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "c1",
								type: "function",
								function: {
									name: "filesystem__read_file",
									arguments: '{"path":"/data/a"}',
								},
							},
						],
					},
					"tool_calls",
				),
			)
			.mockResolvedValueOnce(
				completion({ role: "assistant", content: "中身はworldです" }),
			),
	};
	const executeTool = vi.fn().mockResolvedValue("world");

	const result = await runAgentLoop({
		messages: [{ role: "user", content: "読んで" }],
		tools: [],
		toolChoice: "auto",
		llama,
		executeTool,
		maxIterations: 5,
	});

	expect(executeTool).toHaveBeenCalledWith("filesystem__read_file", {
		path: "/data/a",
	});
	expect(result.choices[0].message.content).toBe("中身はworldです");
});

test("初回のみ tool_choice を渡し、2回目は auto", async () => {
	const chat = vi
		.fn()
		.mockResolvedValueOnce(
			completion(
				{
					role: "assistant",
					content: null,
					tool_calls: [
						{
							id: "c1",
							type: "function",
							function: { name: "brave__web_search", arguments: "{}" },
						},
					],
				},
				"tool_calls",
			),
		)
		.mockResolvedValueOnce(completion({ role: "assistant", content: "done" }));
	const llama: LlamaClient = { chat };

	await runAgentLoop({
		messages: [{ role: "user", content: "braveで調べて" }],
		tools: [],
		toolChoice: { type: "function", function: { name: "brave__web_search" } },
		llama,
		executeTool: vi.fn().mockResolvedValue("結果"),
		maxIterations: 5,
	});

	expect(chat.mock.calls[0][0].tool_choice).toEqual({
		type: "function",
		function: { name: "brave__web_search" },
	});
	expect(chat.mock.calls[1][0].tool_choice).toBe("auto");
});

test("反復上限で打ち切る", async () => {
	const toolCallMsg = completion(
		{
			role: "assistant",
			content: null,
			tool_calls: [
				{
					id: "c1",
					type: "function",
					function: { name: "filesystem__read_file", arguments: "{}" },
				},
			],
		},
		"tool_calls",
	);
	const llama: LlamaClient = { chat: vi.fn().mockResolvedValue(toolCallMsg) }; // 常にツール要求
	const executeTool = vi.fn().mockResolvedValue("x");

	await runAgentLoop({
		messages: [{ role: "user", content: "ループ" }],
		tools: [],
		toolChoice: "auto",
		llama,
		executeTool,
		maxIterations: 3,
	});

	expect(executeTool).toHaveBeenCalledTimes(3);
});

test("ツールエラーも結果として渡して継続する", async () => {
	const llama: LlamaClient = {
		chat: vi
			.fn()
			.mockResolvedValueOnce(
				completion(
					{
						role: "assistant",
						content: null,
						tool_calls: [
							{
								id: "c1",
								type: "function",
								function: { name: "filesystem__read_file", arguments: "{}" },
							},
						],
					},
					"tool_calls",
				),
			)
			.mockResolvedValueOnce(
				completion({ role: "assistant", content: "ごめんなさい" }),
			),
	};
	const executeTool = vi.fn().mockResolvedValue("error: not found");

	const result = await runAgentLoop({
		messages: [{ role: "user", content: "読んで" }],
		tools: [],
		toolChoice: "auto",
		llama,
		executeTool,
		maxIterations: 5,
	});
	expect(result.choices[0].message.content).toBe("ごめんなさい");
});
