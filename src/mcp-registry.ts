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
