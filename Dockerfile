FROM node:20-alpine AS frontend

WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.12-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

ENV CONFIG_PATH=./config.json

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./backend/
COPY config.json .

COPY --from=frontend /build/backend/static/ ./backend/static/

EXPOSE 8080

ENV PORT=8080

CMD ["python", "backend/app.py"]
