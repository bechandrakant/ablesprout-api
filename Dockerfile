# ---- build ----
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build && npm prune --omit=dev

# ---- runtime ----
FROM node:22-bookworm-slim
# Fonts for accessible PDFs: OpenDyslexic (dyslexia_font) and Noto Sans Devanagari (Hindi).
RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-opendyslexic fonts-noto-core \
  && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    DYSLEXIA_FONT_PATH=/usr/share/fonts/opentype/opendyslexic/OpenDyslexic-Regular.otf \
    HINDI_FONT_PATH=/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD node -e "fetch('http://localhost:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/src/server.js"]
