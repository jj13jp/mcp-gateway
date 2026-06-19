import { parseToolName } from "./tools.js"

export type ToolChoice =
	| "auto"
	| { type: "function"; function: { name: string } }

/**
 * 識別子文字（[A-Za-z0-9_]）でないか文字列の端を境界とする正規表現を構築する。
 * \b は _ を単語文字と扱うため使えないので、明示的に境界を定義する。
 */
function buildTokenRegExp(candidate: string): RegExp {
	const escaped = candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
	return new RegExp(`(^|[^A-Za-z0-9_])${escaped}([^A-Za-z0-9_]|$)`, "i")
}

export function resolveToolChoice(
	userText: string,
	toolNames: string[],
): ToolChoice {
	for (const name of toolNames) {
		const { tool } = parseToolName(name)
		// qualified name (e.g. "filesystem__read_file") と bare tool name (e.g. "read_file") のみ候補とする
		const candidates = [name, tool]
		if (candidates.some((c) => buildTokenRegExp(c).test(userText))) {
			return { type: "function", function: { name } }
		}
	}
	return "auto"
}
