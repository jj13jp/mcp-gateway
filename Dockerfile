FROM node:22-slim

# 子MCPを npx で取得するため、Nodeに同梱の npm/npx をそのまま使う
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
COPY pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

COPY servers.json ./servers.json

EXPOSE 8787
CMD ["node", "dist/index.js"]
