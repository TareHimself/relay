FROM node:22-slim AS build
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@11
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json web/
RUN pnpm install --frozen-lockfile
COPY tsconfig.json ./
COPY src src
COPY drizzle drizzle
COPY web web
ENV CI=true
RUN pnpm build && pnpm prune --prod

FROM node:22-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system safe.directory '*' \
 && printf '#!/bin/sh\nexec node /app/dist/index.js "$@"\n' > /usr/local/bin/relay \
 && chmod +x /usr/local/bin/relay
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/dist dist
COPY --from=build /app/drizzle drizzle
COPY --from=build /app/web/dist web/dist
ENV NODE_ENV=production HOST=0.0.0.0 PORT=47821 DATA_DIR=/data
VOLUME /data
EXPOSE 47821
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "dist/index.js"]
