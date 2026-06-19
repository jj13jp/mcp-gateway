// src/server.test.ts
import { expect, test, vi } from "vitest"
import type { McpRegistry } from "./mcp-registry.js"
import { createApp } from "./server.js"

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
		callTool: vi.fn().mockResolvedValue("file content"),
		close: vi.fn(),
	} as unknown as McpRegistry
}

test("initialize リクエストがサーバー情報を返す", async () => {
	const app = createApp({ registry: fakeRegistry(), corsOrigins: [] })
	const res = await app.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 1,
			method: "initialize",
			params: {
				protocolVersion: "2024-11-05",
				capabilities: {},
				clientInfo: { name: "test", version: "0" },
			},
		}),
	})
	expect(res.status).toBe(200)
	const json = await res.json()
	expect(json.result.serverInfo.name).toBe("mcp-gateway")
	expect(json.result.capabilities.tools).toBeDefined()
})

test("tools/list が全ツールを返す", async () => {
	const app = createApp({ registry: fakeRegistry(), corsOrigins: [] })
	const res = await app.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
	})
	expect(res.status).toBe(200)
	const json = await res.json()
	expect(json.result.tools).toHaveLength(1)
	expect(json.result.tools[0].name).toBe("filesystem__read_file")
})

test("tools/call がツールを実行して結果を返す", async () => {
	const registry = fakeRegistry()
	const app = createApp({ registry, corsOrigins: [] })
	const res = await app.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			id: 3,
			method: "tools/call",
			params: {
				name: "filesystem__read_file",
				arguments: { path: "/data/x" },
			},
		}),
	})
	expect(res.status).toBe(200)
	const json = await res.json()
	expect(json.result.content[0].text).toBe("file content")
	expect(registry.callTool).toHaveBeenCalledWith("filesystem", "read_file", {
		path: "/data/x",
	})
})

test("通知は 204 を返す", async () => {
	const app = createApp({ registry: fakeRegistry(), corsOrigins: [] })
	const res = await app.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			jsonrpc: "2.0",
			method: "notifications/initialized",
		}),
	})
	expect(res.status).toBe(202)
})
