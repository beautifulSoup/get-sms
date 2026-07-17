FROM node:22-slim

# better-sqlite3 needs a toolchain to build its native binding
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY tsconfig.json ./
COPY src ./src

ENV GETSMS_DB_PATH=/data/getsms.db
VOLUME ["/data"]
EXPOSE 3000
CMD ["npx", "tsx", "src/index.ts"]
