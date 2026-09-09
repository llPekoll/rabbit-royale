# The Next.js app (web + API routes). The WS server has its own image — see
# Dockerfile.ws — because they scale on different axes: the web tier is
# stateless and replicable, the WS tier holds island state in memory.
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

FROM oven/bun:1 AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM oven/bun:1-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# `public/` is tracked (see public/.gitkeep) — a missing directory here fails
# the build at the COPY rather than at runtime.
COPY --from=build /app/public ./public
EXPOSE 3010
CMD ["bun", "server.js"]
