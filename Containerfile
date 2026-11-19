# NewsPaper — private newsstand. Build with: podman build -t newspaper .   (or docker build)
# podman: add --format docker so the HEALTHCHECK is kept.

FROM docker.io/library/node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
# Kit validates env at build time and DATABASE_URL is required: this placeholder satisfies the
# check only. It is read at runtime (src/env.ts), never baked into the output.
RUN DATABASE_URL=mysql://build:build@127.0.0.1:3306/build npm run build \
	&& npm prune --omit=dev

FROM docker.io/library/node:24-slim
RUN apt-get update \
	&& apt-get install -y --no-install-recommends poppler-utils \
	&& rm -rf /var/lib/apt/lists/* \
	&& mkdir -p /data /newspapers \
	&& chown node:node /data

WORKDIR /app
ENV NODE_ENV=production \
	PORT=3000 \
	NEWSPAPER_DIR=/newspapers \
	DATA_DIR=/data \
	METRICS_PORT=9464 \
	METRICS_HOST=0.0.0.0

# The server bundle keeps its `dependencies` (OpenTelemetry) external: ship the pruned
# production node_modules. The user CLI needs only the two files after it.
COPY --from=build /app/build ./build
# migrations, applied by the server at start (hooks.server.ts init)
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/user.ts ./scripts/user.ts
COPY --from=build /app/src/lib/server/auth/users.ts ./src/lib/server/auth/users.ts

USER node
VOLUME ["/data"]
# 3000 = the app; 9464 = Prometheus /metrics (LAN only: CIDR allowlist METRICS_ALLOW, never
# publish it on a public interface or behind the reverse proxy).
EXPOSE 3000 9464

# start period: waiting for MySQL and applying migrations on a fresh volume
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build"]
