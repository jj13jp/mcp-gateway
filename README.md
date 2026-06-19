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
