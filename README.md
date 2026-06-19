# mcp-gateway

複数の子 MCP サーバーを束ねて、単一の MCP サーバーとして公開するゲートウェイ。

## 仕組み

llama-server（または任意の MCP クライアント）が `POST /mcp` に接続し、ツール一覧取得・実行を行う。ゲートウェイは子 MCP サーバー群にリクエストをルーティングし、結果を返す。

```
MCPクライアント（llama-server など）
        ↓ MCP over HTTP (POST /mcp)
   mcp-gateway :8787
     ↙    ↓    ↘
 filesystem  brave  ...子MCPサーバー群
```

## セットアップ

```bash
cp .env.example .env   # 必要に応じて PORT を変更
mkdir -p data          # filesystem-mcp の対象ディレクトリ
docker compose up --build
```

## 子 MCP サーバーの追加

`servers.json`（プロジェクトルート。`data/` の中ではない）にブロックを追加するだけ:

```json
{
  "filesystem": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem", "/data"] },
  "brave": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-brave-search"], "env": { "BRAVE_API_KEY": "..." } }
}
```

## MCP エンドポイント

| メソッド | パス   | 説明                             |
| -------- | ------ | -------------------------------- |
| POST     | `/mcp` | MCP JSON-RPC（リクエスト・通知） |

### 動作確認

```bash
# initialize
curl http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}'

# tools/list
curl http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'

# tools/call（ツール名は <サーバー名>__<ツール名> の形式）
curl http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"filesystem__read_file","arguments":{"path":"/data/hello.txt"}}}'
```

## 開発

```bash
pnpm install
pnpm test     # vitest
pnpm lint     # biome
pnpm dev      # tsx で起動
```
## 起動

```bash
./llama-server -m model.gguf --ui-mcp-proxy
```