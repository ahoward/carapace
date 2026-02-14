FROM oven/bun:slim

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

RUN mkdir -p /app/data/public /app/data/private

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
