# NewsPaper — private newsstand. Build with: podman build -t newspaper .   (or docker build)
# podman: add --format docker so the HEALTHCHECK is kept.

FROM docker.io/library/node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci
COPY . .
RUN npm run build

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
	DATA_DIR=/data

# The server bundle has no runtime dependencies. The user CLI needs only these two files.
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/scripts/user.ts ./scripts/user.ts
COPY --from=build /app/src/lib/server/auth/users.ts ./src/lib/server/auth/users.ts

USER node
VOLUME ["/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build"]
