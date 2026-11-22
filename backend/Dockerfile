# syntax=docker/dockerfile:1
FROM python:3.14-slim AS builder

WORKDIR /build
COPY pyproject.toml ./
COPY app ./app
RUN pip install --no-cache-dir --prefix=/install .

FROM python:3.14-slim

ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}

RUN groupadd --system app && useradd --system --gid app --home /app app

WORKDIR /app
COPY --from=builder /install /usr/local
COPY app ./app
COPY entrypoint.py ./

RUN mkdir -p /app/data && chown -R app:app /app/data

ENV DB_PATH=/app/data/habits.sqlite
VOLUME /app/data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8080/api/v1/health', timeout=4)"

# Starts as root only to fix the bind-mounted data directory's ownership,
# then drops to the unprivileged `app` user before exec'ing uvicorn.
ENTRYPOINT ["python", "entrypoint.py"]
