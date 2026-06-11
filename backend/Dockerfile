# CrisisPilot backend: FastAPI + WebSockets, plus Node so the Dynatrace MCP
# server (run via npx) is available in the same container.
FROM python:3.11-slim

# Node 20 (for the Dynatrace MCP server) + curl for the NodeSource setup.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps first (layer cache).
COPY backend/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Pre-fetch the Dynatrace MCP server so the first incident isn't delayed.
RUN npm install -g @dynatrace-oss/dynatrace-mcp-server@latest

COPY backend/ ./

# Render/most PaaS inject $PORT.
ENV PORT=8000
EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT}"]
