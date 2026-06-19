# MCPゲートウェイ Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** llama-server 向けに、OpenAI互換 `/v1/chat/completions` を提供し、裏で子MCP（まず filesystem）を束ねてツール実行ループを回すゲートウェイを作る。

**Architecture:** 単一のNode/TSサーバー。起動時に `servers.json` の子MCPを stdio で起動・接続し、ツールを集約する。チャットリクエストを受けたら、ツールを OpenAI `tools` 形式で llama-server に転送し、`tool_calls` が返ったら該当MCPを実行、結果を会話に足して再送、を最終回答まで繰り返す（反復上限つき）。ユーザーがツールを名指しした場合は `tool_choice` で誘導する（ベストエフォート）。

**Tech Stack:** Node.js + TypeScript / pnpm / Hono / `@modelcontextprotocol/sdk` / zod / vitest / biome / Docker

## Global Constraints

- パッケージ管理は pnpm（npm 不可）。
- 言語は TypeScript（ESM、`"type": "module"`）。
- MCP接続は `@modelcontextprotocol/sdk` の v1.x API を使う。importパスは `@modelcontextprotocol/sdk/client/index.js`・`@modelcontextprotocol/sdk/client/stdio.js`・`@modelcontextprotocol/sdk/types.js`。
- テストは vitest、フォーマット/Lintは biome。
- 子MCPの起動失敗は「警告ログを出して、その子だけ無効化し残りで継続」。
- OpenAI関数名は衝突回避のため `"<server>__<tool>"` の形に修飾する（区切りは定数 `TOOL_NAME_SEP = "__"`）。
- 環境変数: `LLAMA_BASE_URL`・`PORT`・`MAX_TOOL_ITERATIONS`。

---

### Task 1: プロジェクト雛形

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `biome.json`
- Create: `vitest.config.ts`
- Create: `src/sanity.test.ts`（雛形確認用、Task 2 で削除）

**Interfaces:**
- Consumes: なし
- Produces: `pnpm test` / `pnpm build` が動く環境。

- [ ] **Step 1: `package.json` を作成**

```json
{
  "name": "mcp-gateway",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "lint": "biome check ."
  },
  "dependencies": {
    "@hono/node-server": "^1.13.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "hono": "^4.6.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@biomejs/biome": "^1.9.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: `tsconfig.json` を作成**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "declaration": false
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: `biome.json` を作成**

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": { "enabled": true, "rules": { "recommended": true } },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 }
}
```

- [ ] **Step 4: `vitest.config.ts` を作成**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 5: 雛形テストを作成**

```ts
// src/sanity.test.ts
import { expect, test } from "vitest";

test("sanity", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 6: 依存をインストールしてテストを実行**

Run: `pnpm install && pnpm test`
Expected: `sanity` テストが PASS。

- [ ] **Step 7: コミット**

```bash
git add package.json tsconfig.json biome.json vitest.config.ts src/sanity.test.ts pnpm-lock.yaml
git commit -m "chore: プロジェクト雛形(pnpm/TS/Hono/vitest/biome)"
```

---

### Task 2: 設定の読み込み・検証 (`config.ts`)

**Files:**
- Create: `src/config.ts`
- Create: `src/config.test.ts`
- Delete: `src/sanity.test.ts`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface ChildServerConfig { command: string; args: string[]; env?: Record<string, string> }`
  - `interface GatewayConfig { servers: Record<string, ChildServerConfig>; llamaBaseUrl: string; port: number; maxToolIterations: number }`
  - `function loadConfig(opts?: { serversJson?: string; env?: Record<string, string | undefined> }): GatewayConfig`
    - `serversJson` は `servers.json` の中身(文字列)。省略時は `./servers.json` を読む。
    - `env` 省略時は `process.env`。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/config.test.ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/config.test.ts`
Expected: FAIL（`loadConfig` 未定義）。

- [ ] **Step 3: 最小実装を書く**

```ts
// src/config.ts
import { readFileSync } from "node:fs";
import { z } from "zod";

export interface ChildServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface GatewayConfig {
  servers: Record<string, ChildServerConfig>;
  llamaBaseUrl: string;
  port: number;
  maxToolIterations: number;
}

const childServerSchema = z.object({
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  env: z.record(z.string()).optional(),
});

const serversSchema = z.record(childServerSchema);

export function loadConfig(opts?: {
  serversJson?: string;
  env?: Record<string, string | undefined>;
}): GatewayConfig {
  const env = opts?.env ?? process.env;
  const raw = opts?.serversJson ?? readFileSync("./servers.json", "utf8");

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch (e) {
    throw new Error(`servers.json のJSONパースに失敗: ${(e as Error).message}`);
  }
  const servers = serversSchema.parse(parsedJson);

  const llamaBaseUrl = env.LLAMA_BASE_URL;
  if (!llamaBaseUrl) throw new Error("環境変数 LLAMA_BASE_URL が必要です");

  const port = env.PORT ? Number(env.PORT) : 8787;
  const maxToolIterations = env.MAX_TOOL_ITERATIONS ? Number(env.MAX_TOOL_ITERATIONS) : 8;

  return { servers, llamaBaseUrl, port, maxToolIterations };
}
```

- [ ] **Step 4: 雛形テストを削除**

```bash
rm src/sanity.test.ts
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm vitest run src/config.test.ts`
Expected: 4件 PASS。

- [ ] **Step 6: コミット**

```bash
git add src/config.ts src/config.test.ts
git rm src/sanity.test.ts
git commit -m "feat: 設定の読み込みと検証(config.ts)"
```

---

### Task 3: ツール定義の変換 (`tools.ts`)

**Files:**
- Create: `src/tools.ts`
- Create: `src/tools.test.ts`

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk/types.js` の `Tool` 型（`{ name: string; description?: string; inputSchema: object }`）。
- Produces:
  - `const TOOL_NAME_SEP = "__"`
  - `interface OpenAITool { type: "function"; function: { name: string; description?: string; parameters: Record<string, unknown> } }`
  - `function qualifyToolName(server: string, tool: string): string`（`server + "__" + tool`）
  - `function parseToolName(qualified: string): { server: string; tool: string }`
  - `function toOpenAITools(toolsByServer: Map<string, Tool[]>): OpenAITool[]`

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/tools.test.ts
import { expect, test } from "vitest";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { parseToolName, qualifyToolName, toOpenAITools } from "./tools.js";

const fsTools: Tool[] = [
  {
    name: "read_file",
    description: "Read a file",
    inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
  },
];

test("qualify と parse は往復する", () => {
  const q = qualifyToolName("filesystem", "read_file");
  expect(q).toBe("filesystem__read_file");
  expect(parseToolName(q)).toEqual({ server: "filesystem", tool: "read_file" });
});

test("ツール名にセパレータが含まれても tool 側に残す", () => {
  expect(parseToolName("fs__read__file")).toEqual({ server: "fs", tool: "read__file" });
});

test("MCPツールを OpenAI tools 形式へ変換する", () => {
  const map = new Map<string, Tool[]>([["filesystem", fsTools]]);
  const out = toOpenAITools(map);
  expect(out).toEqual([
    {
      type: "function",
      function: {
        name: "filesystem__read_file",
        description: "Read a file",
        parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"] },
      },
    },
  ]);
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/tools.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 最小実装を書く**

```ts
// src/tools.ts
import type { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOL_NAME_SEP = "__";

export interface OpenAITool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export function qualifyToolName(server: string, tool: string): string {
  return `${server}${TOOL_NAME_SEP}${tool}`;
}

export function parseToolName(qualified: string): { server: string; tool: string } {
  const idx = qualified.indexOf(TOOL_NAME_SEP);
  if (idx === -1) throw new Error(`ツール名にセパレータがありません: ${qualified}`);
  return {
    server: qualified.slice(0, idx),
    tool: qualified.slice(idx + TOOL_NAME_SEP.length),
  };
}

export function toOpenAITools(toolsByServer: Map<string, Tool[]>): OpenAITool[] {
  const out: OpenAITool[] = [];
  for (const [server, tools] of toolsByServer) {
    for (const tool of tools) {
      out.push({
        type: "function",
        function: {
          name: qualifyToolName(server, tool.name),
          description: tool.description,
          parameters: (tool.inputSchema as Record<string, unknown>) ?? { type: "object" },
        },
      });
    }
  }
  return out;
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/tools.test.ts`
Expected: 3件 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/tools.ts src/tools.test.ts
git commit -m "feat: MCPツール↔OpenAI tools 変換(tools.ts)"
```

---

### Task 4: 名指しツールの tool_choice 解決 (`tool-choice.ts`)

**Files:**
- Create: `src/tool-choice.ts`
- Create: `src/tool-choice.test.ts`

**Interfaces:**
- Consumes: `parseToolName`（tools.ts）。
- Produces:
  - `type ToolChoice = "auto" | { type: "function"; function: { name: string } }`
  - `function resolveToolChoice(userText: string, toolNames: string[]): ToolChoice`
    - `toolNames` は修飾済み名（例 `filesystem__read_file`）の配列。
    - ユーザー発話にツール名・server部・tool部のいずれかが（大小無視で）含まれていれば、その修飾名を強制。複数該当時は `toolNames` の並び順で最初の一致。未検出は `"auto"`。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/tool-choice.test.ts
import { expect, test } from "vitest";
import { resolveToolChoice } from "./tool-choice.js";

const names = ["filesystem__read_file", "brave__web_search"];

test("server名の名指しで強制する", () => {
  expect(resolveToolChoice("braveを使って東京の天気を調べて", names)).toEqual({
    type: "function",
    function: { name: "brave__web_search" },
  });
});

test("tool名の名指しで強制する", () => {
  expect(resolveToolChoice("read_file で中身を見せて", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("大小文字を無視する", () => {
  expect(resolveToolChoice("use FILESYSTEM please", names)).toEqual({
    type: "function",
    function: { name: "filesystem__read_file" },
  });
});

test("該当なしは auto", () => {
  expect(resolveToolChoice("こんにちは", names)).toBe("auto");
});
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/tool-choice.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 最小実装を書く**

```ts
// src/tool-choice.ts
import { parseToolName } from "./tools.js";

export type ToolChoice = "auto" | { type: "function"; function: { name: string } };

export function resolveToolChoice(userText: string, toolNames: string[]): ToolChoice {
  const haystack = userText.toLowerCase();
  for (const name of toolNames) {
    const { server, tool } = parseToolName(name);
    const candidates = [name, server, tool].map((s) => s.toLowerCase());
    if (candidates.some((c) => haystack.includes(c))) {
      return { type: "function", function: { name } };
    }
  }
  return "auto";
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/tool-choice.test.ts`
Expected: 4件 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/tool-choice.ts src/tool-choice.test.ts
git commit -m "feat: 名指しツールの tool_choice 解決(tool-choice.ts)"
```

---

### Task 5: 子MCPレジストリ (`mcp-registry.ts`)

**Files:**
- Create: `src/mcp-registry.ts`
- Create: `src/mcp-registry.test.ts`

**Interfaces:**
- Consumes: `ChildServerConfig`（config.ts）、`@modelcontextprotocol/sdk` の `Client`・`StdioClientTransport`、`Tool` 型。
- Produces:
  - `interface Logger { warn(msg: string): void }`
  - `class McpRegistry`
    - `static async start(servers: Record<string, ChildServerConfig>, logger?: Logger): Promise<McpRegistry>`
      - 各子MCPを接続。失敗した子は `logger.warn` を出して無効化し継続。
    - `listTools(): Map<string, Tool[]>`（server名 → ツール配列）
    - `async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<string>`
      - 結果の `content` を文字列化して返す。`isError` の場合も投げずに、エラー内容を含む文字列を返す（ループがLLMへ戻せるように）。
    - `async close(): Promise<void>`

**Note:** これは実際に filesystem-mcp を起動する統合テスト。`@modelcontextprotocol/server-filesystem` を `npx -y` で取得できるネットワークが必要。テスト用の一時ディレクトリを作って `/data` 相当として渡す。

- [ ] **Step 1: 失敗するテストを書く**

```ts
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/mcp-registry.test.ts`
Expected: FAIL（`McpRegistry` 未定義）。

- [ ] **Step 3: 最小実装を書く**

```ts
// src/mcp-registry.ts
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ChildServerConfig } from "./config.js";

export interface Logger {
  warn(msg: string): void;
}

interface Child {
  client: Client;
  tools: Tool[];
}

export class McpRegistry {
  private constructor(private readonly children: Map<string, Child>) {}

  static async start(
    servers: Record<string, ChildServerConfig>,
    logger: Logger = console,
  ): Promise<McpRegistry> {
    const children = new Map<string, Child>();
    for (const [name, cfg] of Object.entries(servers)) {
      try {
        const client = new Client({ name: "mcp-gateway", version: "0.1.0" });
        const transport = new StdioClientTransport({
          command: cfg.command,
          args: cfg.args,
          env: cfg.env,
          stderr: "pipe",
        });
        await client.connect(transport);
        const { tools } = await client.listTools();
        children.set(name, { client, tools });
      } catch (e) {
        logger.warn(`子MCP "${name}" の起動に失敗したため無効化します: ${(e as Error).message}`);
      }
    }
    return new McpRegistry(children);
  }

  listTools(): Map<string, Tool[]> {
    const out = new Map<string, Tool[]>();
    for (const [name, child] of this.children) out.set(name, child.tools);
    return out;
  }

  async callTool(server: string, tool: string, args: Record<string, unknown>): Promise<string> {
    const child = this.children.get(server);
    if (!child) return `error: 子MCP "${server}" は存在しません`;
    try {
      const result = await child.client.callTool({ name: tool, arguments: args });
      const text = Array.isArray(result.content)
        ? result.content
            .map((c) => (c.type === "text" ? c.text : JSON.stringify(c)))
            .join("\n")
        : JSON.stringify(result.content);
      return result.isError ? `error: ${text}` : text;
    } catch (e) {
      return `error: ツール実行に失敗: ${(e as Error).message}`;
    }
  }

  async close(): Promise<void> {
    for (const child of this.children.values()) {
      await child.client.close().catch(() => {});
    }
  }
}
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/mcp-registry.test.ts`
Expected: 3件 PASS（npx取得に時間がかかるため初回は数十秒）。

- [ ] **Step 5: コミット**

```bash
git add src/mcp-registry.ts src/mcp-registry.test.ts
git commit -m "feat: 子MCPレジストリ(起動・集約・実行・失敗時継続)"
```

---

### Task 6: エージェントループ (`agent-loop.ts`)

**Files:**
- Create: `src/agent-loop.ts`
- Create: `src/agent-loop.test.ts`

**Interfaces:**
- Consumes: `OpenAITool`（tools.ts）、`ToolChoice`（tool-choice.ts）。
- Produces:
  - `interface ToolCall { id: string; type: "function"; function: { name: string; arguments: string } }`
  - `interface ChatMessage { role: string; content: string | null; tool_calls?: ToolCall[]; tool_call_id?: string; name?: string }`
  - `interface ChatCompletion { choices: { message: ChatMessage; finish_reason: string }[] }`
  - `interface LlamaClient { chat(req: { messages: ChatMessage[]; tools: OpenAITool[]; tool_choice: ToolChoice }): Promise<ChatCompletion> }`
  - `type ExecuteTool = (qualifiedName: string, args: Record<string, unknown>) => Promise<string>`
  - `async function runAgentLoop(params: { messages: ChatMessage[]; tools: OpenAITool[]; toolChoice: ToolChoice; llama: LlamaClient; executeTool: ExecuteTool; maxIterations: number }): Promise<ChatCompletion>`
    - 1回目の llama 呼び出しに `params.toolChoice` を使い、2回目以降は `"auto"`。
    - 返ってきた assistant メッセージに `tool_calls` があれば各ツールを `executeTool` で実行し、`role: "tool"` メッセージ（`tool_call_id`・`content`）を履歴に足して再呼び出し。
    - `tool_calls` が無ければそのまま返す。`maxIterations` 回ツールを実行しても終わらなければ、その時点の最後の completion を返す。

- [ ] **Step 1: 失敗するテストを書く**

```ts
// src/agent-loop.test.ts
import { expect, test, vi } from "vitest";
import { type ChatCompletion, type LlamaClient, runAgentLoop } from "./agent-loop.js";

function completion(message: ChatCompletion["choices"][0]["message"], finish = "stop"): ChatCompletion {
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
              { id: "c1", type: "function", function: { name: "filesystem__read_file", arguments: '{"path":"/data/a"}' } },
            ],
          },
          "tool_calls",
        ),
      )
      .mockResolvedValueOnce(completion({ role: "assistant", content: "中身はworldです" })),
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

  expect(executeTool).toHaveBeenCalledWith("filesystem__read_file", { path: "/data/a" });
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
          tool_calls: [{ id: "c1", type: "function", function: { name: "brave__web_search", arguments: "{}" } }],
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

  expect(chat.mock.calls[0][0].tool_choice).toEqual({ type: "function", function: { name: "brave__web_search" } });
  expect(chat.mock.calls[1][0].tool_choice).toBe("auto");
});

test("反復上限で打ち切る", async () => {
  const toolCallMsg = completion(
    {
      role: "assistant",
      content: null,
      tool_calls: [{ id: "c1", type: "function", function: { name: "filesystem__read_file", arguments: "{}" } }],
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
            tool_calls: [{ id: "c1", type: "function", function: { name: "filesystem__read_file", arguments: "{}" } }],
          },
          "tool_calls",
        ),
      )
      .mockResolvedValueOnce(completion({ role: "assistant", content: "ごめんなさい" })),
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/agent-loop.test.ts`
Expected: FAIL（未定義）。

- [ ] **Step 3: 最小実装を書く**

```ts
// src/agent-loop.ts
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
  chat(req: { messages: ChatMessage[]; tools: OpenAITool[]; tool_choice: ToolChoice }): Promise<ChatCompletion>;
}

export type ExecuteTool = (qualifiedName: string, args: Record<string, unknown>) => Promise<string>;

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
    const completion = await llama.chat({ messages, tools, tool_choice: toolChoice });
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
        args = call.function.arguments ? JSON.parse(call.function.arguments) : {};
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
```

- [ ] **Step 4: テストが通ることを確認**

Run: `pnpm vitest run src/agent-loop.test.ts`
Expected: 4件 PASS。

- [ ] **Step 5: コミット**

```bash
git add src/agent-loop.ts src/agent-loop.test.ts
git commit -m "feat: エージェントループ(tool_calls実行・反復上限・tool_choice初回適用)"
```

---

### Task 7: HTTPサーバーと起動配線 (`server.ts` / `index.ts`)

**Files:**
- Create: `src/llama-client.ts`
- Create: `src/server.ts`
- Create: `src/server.test.ts`
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `McpRegistry`、`toOpenAITools`・`parseToolName`、`resolveToolChoice`、`runAgentLoop`・`ChatMessage`・`LlamaClient`、`GatewayConfig`。
- Produces:
  - `src/llama-client.ts`: `function createLlamaClient(baseUrl: string): LlamaClient`（`fetch` で `${baseUrl}/v1/chat/completions` にPOST）。
  - `src/server.ts`: `function createApp(deps: { registry: McpRegistry; llama: LlamaClient; maxToolIterations: number }): Hono` — `POST /v1/chat/completions` を提供。
  - `src/index.ts`: 設定読込→レジストリ起動→Honoを `@hono/node-server` で起動。

- [ ] **Step 1: 失敗するテストを書く（server.ts のエンドポイント）**

```ts
// src/server.test.ts
import { expect, test, vi } from "vitest";
import type { McpRegistry } from "./mcp-registry.js";
import { createApp } from "./server.js";

function fakeRegistry(): McpRegistry {
  return {
    listTools: () =>
      new Map([
        ["filesystem", [{ name: "read_file", description: "read", inputSchema: { type: "object" } }]],
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
                { id: "c1", type: "function", function: { name: "filesystem__read_file", arguments: '{"path":"/data/x"}' } },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { role: "assistant", content: "worldでした" }, finish_reason: "stop" }],
      }),
  };

  const app = createApp({ registry: fakeRegistry(), llama, maxToolIterations: 5 });
  const res = await app.request("/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model: "local", messages: [{ role: "user", content: "read_fileで読んで" }] }),
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
```

- [ ] **Step 2: テストが落ちることを確認**

Run: `pnpm vitest run src/server.test.ts`
Expected: FAIL（`createApp` 未定義）。

- [ ] **Step 3: `llama-client.ts` を実装**

```ts
// src/llama-client.ts
import type { ChatCompletion, LlamaClient } from "./agent-loop.js";

export function createLlamaClient(baseUrl: string): LlamaClient {
  return {
    async chat(req) {
      const res = await fetch(`${baseUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(req),
      });
      if (!res.ok) throw new Error(`llama-server エラー: ${res.status} ${await res.text()}`);
      return (await res.json()) as ChatCompletion;
    },
  };
}
```

- [ ] **Step 4: `server.ts` を実装**

```ts
// src/server.ts
import { Hono } from "hono";
import type { ChatMessage, LlamaClient } from "./agent-loop.js";
import { runAgentLoop } from "./agent-loop.js";
import type { McpRegistry } from "./mcp-registry.js";
import { resolveToolChoice } from "./tool-choice.js";
import { parseToolName, toOpenAITools } from "./tools.js";

export function createApp(deps: {
  registry: McpRegistry;
  llama: LlamaClient;
  maxToolIterations: number;
}): Hono {
  const { registry, llama, maxToolIterations } = deps;
  const app = new Hono();

  app.post("/v1/chat/completions", async (c) => {
    const body = await c.req.json<{ messages: ChatMessage[] }>();
    const tools = toOpenAITools(registry.listTools());
    const toolNames = tools.map((t) => t.function.name);

    const lastUser = [...body.messages].reverse().find((m) => m.role === "user");
    const toolChoice = resolveToolChoice(lastUser?.content ?? "", toolNames);

    const executeTool = async (qualified: string, args: Record<string, unknown>) => {
      const { server, tool } = parseToolName(qualified);
      return registry.callTool(server, tool, args);
    };

    const result = await runAgentLoop({
      messages: body.messages,
      tools,
      toolChoice,
      llama,
      executeTool,
      maxIterations: maxToolIterations,
    });

    return c.json(result);
  });

  return app;
}
```

- [ ] **Step 5: テストが通ることを確認**

Run: `pnpm vitest run src/server.test.ts`
Expected: PASS。

- [ ] **Step 6: `index.ts` を実装（起動配線）**

```ts
// src/index.ts
import { serve } from "@hono/node-server";
import { loadConfig } from "./config.js";
import { createLlamaClient } from "./llama-client.js";
import { McpRegistry } from "./mcp-registry.js";
import { createApp } from "./server.js";

async function main() {
  const config = loadConfig();
  const registry = await McpRegistry.start(config.servers);
  const llama = createLlamaClient(config.llamaBaseUrl);
  const app = createApp({ registry, llama, maxToolIterations: config.maxToolIterations });

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`mcp-gateway listening on :${info.port}`);
  });

  const shutdown = async () => {
    await registry.close();
    server.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 7: 型チェック/ビルドが通ることを確認**

Run: `pnpm build`
Expected: エラーなく `dist/` が生成される。

- [ ] **Step 8: コミット**

```bash
git add src/llama-client.ts src/server.ts src/server.test.ts src/index.ts
git commit -m "feat: HTTPエンドポイントと起動配線(Hono /v1/chat/completions)"
```

---

### Task 8: Docker・設定サンプル・ドキュメント

**Files:**
- Create: `servers.json`
- Create: `.env.example`
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `compose.yaml`
- Create: `README.md`

**Interfaces:**
- Consumes: 既存の全モジュール（`pnpm build` で `dist/index.js`）。
- Produces: `docker compose up` で起動し、`curl` でE2E確認できる構成。

- [ ] **Step 1: `servers.json`（filesystem 1個）を作成**

```json
{
  "filesystem": {
    "command": "npx",
    "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"]
  }
}
```

- [ ] **Step 2: `.env.example` を作成（値の意味をコメントで明記）**

```bash
# llama-server のベースURL（OpenAI互換APIのルート。末尾に /v1 を含めない）
# 例: 同一docker network なら http://llama:8080 / ホスト上なら http://host.docker.internal:8080
LLAMA_BASE_URL=http://host.docker.internal:8080

# ゲートウェイの待受ポート
PORT=8787

# エージェントループでツールを実行する最大反復回数（無限ループ防止）
MAX_TOOL_ITERATIONS=8
```

- [ ] **Step 3: `.dockerignore` を作成**

```
node_modules
dist
.env
.git
```

- [ ] **Step 4: `Dockerfile` を作成（Node + npx を含む）**

```dockerfile
FROM node:22-slim

# 子MCPを npx で取得するため、Nodeに同梱の npm/npx をそのまま使う
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

COPY servers.json ./servers.json

EXPOSE 8787
CMD ["node", "dist/index.js"]
```

- [ ] **Step 5: `compose.yaml` を作成**

```yaml
services:
  gateway:
    build: .
    ports:
      - "8787:8787"
    env_file:
      - .env
    volumes:
      # filesystem-mcp が操作する対象ディレクトリ。ホストの ./data をコンテナの /data へ
      - ./data:/data
    extra_hosts:
      # ホスト上の llama-server を host.docker.internal で参照できるように
      - "host.docker.internal:host-gateway"
```

- [ ] **Step 6: `README.md` を作成**

````markdown
# mcp-gateway

llama-server 向けの OpenAI互換ゲートウェイ。`/v1/chat/completions` を受け、裏で子MCP（まず filesystem）を束ねてツール実行ループを回す。

## 仕組み

クライアント → `/v1/chat/completions` → ゲートウェイが子MCPのツールを付けて llama-server に転送 → `tool_calls` が返ればMCPを実行して結果を会話に戻す → 最終回答まで繰り返す（反復上限 `MAX_TOOL_ITERATIONS`）。

## セットアップ

```bash
cp .env.example .env   # LLAMA_BASE_URL などを編集
mkdir -p data          # filesystem-mcp の対象ディレクトリ
docker compose up --build
```

## 子MCPの追加

`servers.json` にブロックを足すだけ:

```json
{
  "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"] },
  "brave": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "..." } }
}
```

## 動作確認

```bash
curl http://localhost:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"local","messages":[{"role":"user","content":"read_file で /data/hello.txt を読んで"}]}'
```

## 開発

```bash
pnpm install
pnpm test     # vitest
pnpm lint     # biome
pnpm dev      # tsx で起動
```
````

- [ ] **Step 7: 手動E2E**

```bash
mkdir -p data && echo "world" > data/hello.txt
# .env の LLAMA_BASE_URL を稼働中の llama-server に向ける（--jinja 付きで起動しておく）
docker compose up --build -d
curl http://localhost:8787/v1/chat/completions \
  -H 'content-type: application/json' \
  -d '{"model":"local","messages":[{"role":"user","content":"read_file で /data/hello.txt を読んで"}]}'
```
Expected: 応答に "world" を読んだ内容が含まれる。確認後 `docker compose down`。

- [ ] **Step 8: コミット**

```bash
git add servers.json .env.example Dockerfile .dockerignore compose.yaml README.md
git commit -m "chore: Docker構成・設定サンプル・README"
```

---

## 完了の定義

- `pnpm test` が全タスクのテストでグリーン。
- `pnpm build` がエラーなく通る。
- `docker compose up` で起動し、`curl` のE2Eで filesystem ツールが実行され "world" が返る。
- 新しい子MCPは `servers.json` への追記だけで追加できる。
