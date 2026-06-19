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
