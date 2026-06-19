import { readFileSync } from "node:fs"
import { z } from "zod"

export interface ChildServerConfig {
	command: string
	args: string[]
	env?: Record<string, string>
}

export interface GatewayConfig {
	servers: Record<string, ChildServerConfig>
	llamaBaseUrl: string
	port: number
	maxToolIterations: number
}

const childServerSchema = z.object({
	command: z.string().min(1),
	args: z.array(z.string()).default([]),
	env: z.record(z.string()).optional(),
})

const serversSchema = z.record(childServerSchema)

function parseIntEnv(
	value: string | undefined,
	fallback: number,
	name: string,
): number {
	if (value === undefined) return fallback
	const n = Number(value)
	if (!Number.isInteger(n) || n <= 0)
		throw new Error(`環境変数 ${name} は正の整数である必要があります: ${value}`)
	return n
}

export function loadConfig(opts?: {
	serversJson?: string
	env?: Record<string, string | undefined>
}): GatewayConfig {
	const env = opts?.env ?? process.env
	const raw = opts?.serversJson ?? readFileSync("./servers.json", "utf8")

	let parsedJson: unknown
	try {
		parsedJson = JSON.parse(raw)
	} catch (e) {
		throw new Error(`servers.json のJSONパースに失敗: ${(e as Error).message}`)
	}
	const servers = serversSchema.parse(parsedJson)

	const llamaBaseUrl = env.LLAMA_BASE_URL
	if (!llamaBaseUrl) throw new Error("環境変数 LLAMA_BASE_URL が必要です")

	const port = parseIntEnv(env.PORT, 8787, "PORT")
	const maxToolIterations = parseIntEnv(
		env.MAX_TOOL_ITERATIONS,
		8,
		"MAX_TOOL_ITERATIONS",
	)

	return { servers, llamaBaseUrl, port, maxToolIterations }
}
