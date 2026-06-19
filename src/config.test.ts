import { expect, test } from "vitest"
import { loadConfig } from "./config.js"

const validServers = JSON.stringify({
	filesystem: {
		command: "npx",
		args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"],
	},
})

test("有効な設定を読み込む", () => {
	const cfg = loadConfig({
		serversJson: validServers,
		env: { PORT: "3000" },
	})
	expect(cfg.port).toBe(3000)
	expect(cfg.servers.filesystem.command).toBe("npx")
})

test("不正な servers.json で例外", () => {
	expect(() => loadConfig({ serversJson: "{ not json", env: {} })).toThrow()
})

test("PORT は既定値を持つ", () => {
	const cfg = loadConfig({ serversJson: validServers, env: {} })
	expect(cfg.port).toBe(8787)
})

test("PORT に非数値が渡されると例外", () => {
	expect(() =>
		loadConfig({ serversJson: validServers, env: { PORT: "abc" } }),
	).toThrow()
})
