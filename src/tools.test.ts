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
