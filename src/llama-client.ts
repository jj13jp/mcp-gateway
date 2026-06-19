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
			if (!res.ok)
				throw new Error(
					`llama-server エラー: ${res.status} ${await res.text()}`,
				);
			return (await res.json()) as ChatCompletion;
		},
	};
}
