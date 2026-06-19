import { expect, test } from "vitest";
import { loadConfig } from "./config.js";

const validServers = JSON.stringify({
  filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", "/data"] },
});

test("有効な設定を読み込む", () => {
  const cfg = loadConfig({
    serversJson: validServers,
    env: { LLAMA_BASE_URL: "http://llama:8080", PORT: "3000", MAX_TOOL_ITERATIONS: "5" },
  });
  expect(cfg.llamaBaseUrl).toBe("http://llama:8080");
  expect(cfg.port).toBe(3000);
  expect(cfg.maxToolIterations).toBe(5);
  expect(cfg.servers.filesystem.command).toBe("npx");
});

test("LLAMA_BASE_URL 欠落で例外", () => {
  expect(() => loadConfig({ serversJson: validServers, env: {} })).toThrow();
});

test("不正な servers.json で例外", () => {
  expect(() =>
    loadConfig({ serversJson: "{ not json", env: { LLAMA_BASE_URL: "http://x" } }),
  ).toThrow();
});

test("PORT/MAX_TOOL_ITERATIONS は既定値を持つ", () => {
  const cfg = loadConfig({ serversJson: validServers, env: { LLAMA_BASE_URL: "http://x" } });
  expect(cfg.port).toBe(8787);
  expect(cfg.maxToolIterations).toBe(8);
});
