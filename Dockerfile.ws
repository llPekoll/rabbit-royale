# The authoritative game server. Bun compiles runtime + code + deps into ONE
# binary, so the runtime image carries no node_modules, no source, no toolchain.
#
#   docker build -f Dockerfile.ws -t rr-ws .
#
# Build on the deploy arch (the target VPS is amd64): from an arm64 dev box add
# --platform=linux/amd64. Coolify builds on the host, so it matches natively.
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY tsconfig.json ./
COPY config ./config
COPY server ./server
COPY src ./src
RUN bun build server/index.ts --compile --minify --outfile ws-server

FROM alpine:3
WORKDIR /app
# Bun's single-file binary needs libstdc++/libgcc at runtime on musl.
RUN apk add --no-cache libstdc++ libgcc
COPY --from=build /app/ws-server ./ws-server
EXPOSE 3010
CMD ["./ws-server"]
