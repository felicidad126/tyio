# syntax=docker/dockerfile:1
# Satu image berisi API dan hasil build web (R-A: satu aplikasi yang di-deploy).
# Dibangun dari akar repo:  docker build -f deploy/Dockerfile -t npr-app .
# Satu image dipakai untuk tiga peran: migrasi, seed, dan aplikasi.
#
# Jaringan dengan proxy pemeriksa TLS (proxy kantor): berikan sertifikat CA-nya lewat
#   --secret id=extra_ca,src=/path/ke/ca.pem
# Secret hanya terpasang saat build dan tidak tersimpan di image.

ARG NODE_IMAGE=node:26-trixie-slim@sha256:e6bedef217677b276c591795e169840edd9096dbf13f29df8ef8d1856b8820bc

FROM ${NODE_IMAGE} AS build
WORKDIR /src

# Dependensi dulu, agar lapisan ini tetap ter-cache selama lockfile tidak berubah.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN --mount=type=secret,id=extra_ca \
    --mount=type=cache,id=npr-pnpm-store,target=/root/.local/share/pnpm/store \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && npm install -g --no-audit --no-fund "$(node -p "require('./package.json').packageManager")" \
 && pnpm install --frozen-lockfile

COPY . .
# Build semua paket, lalu kumpulkan API + dependensi produksinya saja ke /out.
RUN --mount=type=secret,id=extra_ca \
    --mount=type=cache,id=npr-pnpm-store,target=/root/.local/share/pnpm/store \
    if [ -s /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi \
 && pnpm build \
 && pnpm --filter @npr/api deploy --prod /out \
 && cp -r apps/web/dist /out/public

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    WEB_DIST_DIR=/app/public
WORKDIR /app
# Berkas milik root dan hanya-baca bagi proses; aplikasi berjalan sebagai pengguna `node`.
COPY --from=build /out ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]
