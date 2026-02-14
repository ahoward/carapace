FROM oven/bun:slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json ./
COPY src/ ./src/

RUN mkdir -p /app/data/public /app/data/private

# Install uv + SkyPilot using same paths as dev (steel thread)
ENV CARAPACE_HOME="/root/.carapace"
RUN mkdir -p ${CARAPACE_HOME}/uv/bin && \
    curl -fsSL https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-unknown-linux-gnu.tar.gz \
    | tar xzf - --strip-components=1 -C ${CARAPACE_HOME}/uv/bin && \
    chmod +x ${CARAPACE_HOME}/uv/bin/uv

ENV UV_TOOL_BIN_DIR="${CARAPACE_HOME}/tools/bin"
ENV UV_TOOL_DIR="${CARAPACE_HOME}/tools/environments"
ENV UV_PYTHON_INSTALL_DIR="${CARAPACE_HOME}/python"
RUN ${CARAPACE_HOME}/uv/bin/uv tool install "skypilot-nightly[aws]"

EXPOSE 3001

CMD ["bun", "run", "src/index.ts"]
