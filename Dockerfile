FROM oven/bun:latest

WORKDIR /app
COPY . .
RUN bun install
RUN mkdir -p /app/data

ENV DATABASE_PATH=/app/data/data.db
VOLUME ["/app/data"]

CMD ["bun", "src/index.ts"]
