# Imagem única: serve a tela (Next) e também roda os jobs pelo terminal do EasyPanel
# (ex.: `pnpm daily`, `pnpm job:sync -- --from 2026-09-01`, `pnpm publish:weekly`).
FROM node:22-bookworm-slim

# Prisma precisa do OpenSSL; ca-certificates para falar com a FLW e a OpenAI.
RUN apt-get update -y \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

# Dependências (todas, inclusive dev: os jobs rodam com tsx e as migrations com prisma)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# Código, client do Prisma (gerado para o Linux da imagem) e build do Next
COPY . .
RUN pnpm prisma generate \
 && pnpm web:build

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Aplica as migrations e sobe a tela. Escuta em 0.0.0.0 (dentro do container).
# Em produção a tela exige REPORT_BASIC_AUTH_USER/PASS; sem elas responde 503.
CMD ["sh", "-c", "pnpm prisma migrate deploy && pnpm next start -H 0.0.0.0 -p ${PORT}"]
