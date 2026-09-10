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
# libstdc++/libgcc: Bun's single-file binary needs them at runtime on musl.
# wget: for the healthcheck below. Alpine ships busybox's applet, but it is
# installed explicitly rather than assumed — a healthcheck whose binary is
# missing fails every probe, which reads as a broken server rather than as a
# broken healthcheck.
RUN apk add --no-cache libstdc++ libgcc wget

COPY --from=build /app/ws-server ./ws-server
EXPOSE 3010

# Tell the orchestrator the difference between "started" and "serving".
#
# Without this, Coolify only knows the process exists — so a server that is up
# but wedged looks healthy, and one that is merely slow to boot looks dead. The
# generous start-period is deliberate: a restart during boot is what turns one
# bad minute into "Restart limit reached".
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3010/health || exit 1

# PID 1 must forward signals, or SIGTERM never reaches the server and every
# deploy ends in a SIGKILL that reads as a crash in the deployment log.
STOPSIGNAL SIGTERM
CMD ["./ws-server"]
