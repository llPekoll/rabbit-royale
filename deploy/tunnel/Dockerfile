# The WireGuard tunnel between the regions and Europe's databases.
# See deploy/tunnel/README.md.
FROM alpine:3.22
RUN apk add --no-cache wireguard-tools wireguard-go socat
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["sh", "/entrypoint.sh"]
