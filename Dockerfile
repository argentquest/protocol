FROM node:20.19-bookworm-slim AS build

WORKDIR /app

ARG VITE_BASE_PATH=/
ARG VITE_GA_MEASUREMENT_ID=G-2ZWLL7P02J
ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_GA_MEASUREMENT_ID=${VITE_GA_MEASUREMENT_ID}

RUN apt-get update \
    && apt-get install --yes --no-install-recommends ffmpeg \
    && ffmpeg -version \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20.19-bookworm-slim AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=4173
ENV PATH_PROTOCOL_DATA_DIR=/app/data/themes
ENV PATH_PROTOCOL_DB_PATH=/app/data/path-protocol.sqlite

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/public ./public
COPY --from=build /app/PublicMedia ./PublicMedia

RUN mkdir -p /app/data/themes

EXPOSE 4173

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4173/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "server/index.js"]
