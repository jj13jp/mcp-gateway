// src/mcp-registry.test.ts
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { McpRegistry } from "./mcp-registry.js";

let dir: string;
let registry: McpRegistry;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "mcp-gw-"));
  writeFileSync(join(dir, "hello.txt"), "world");
  registry = await McpRegistry.start({
    filesystem: { command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem", dir] },
  });
}, 60_000);

afterAll(async () => {
  await registry?.close();
});

test("子MCPのツールを集約する", () => {
  const tools = registry.listTools();
  const names = (tools.get("filesystem") ?? []).map((t) => t.name);
  expect(names).toContain("read_file");
});

test("ツールを実行できる", async () => {
  const result = await registry.callTool("filesystem", "read_file", { path: join(dir, "hello.txt") });
  expect(result).toContain("world");
});

test("起動失敗した子は警告して無効化し継続する", async () => {
  const warnings: string[] = [];
  const reg = await McpRegistry.start(
    { broken: { command: "this-command-does-not-exist", args: [] } },
    { warn: (m) => warnings.push(m) },
  );
  expect(reg.listTools().has("broken")).toBe(false);
  expect(warnings.join()).toContain("broken");
  await reg.close();
}, 30_000);
