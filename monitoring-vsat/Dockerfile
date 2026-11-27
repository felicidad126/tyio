# Image NPR untuk server sendiri: tampilan React + server Node.js + SQLite.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm run build:server

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DB_PATH=/data/npr.sqlite \
    TZ=Asia/Jakarta \
    NODE_NO_WARNINGS=1
WORKDIR /app
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/dist/server ./dist/server
COPY schema.sql seed-data.sql ./
COPY migrations ./migrations
# Database disimpan di /data (volume), dimiliki user node, bukan root.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Commit yang dibangun, tampil di /api/health. Diletakkan di akhir supaya
# lapisan di atasnya tetap bisa memakai cache saat commit berganti.
ARG NPR_VERSI=""
ENV NPR_VERSI=$NPR_VERSI
CMD ["node", "dist/server/main.js"]
