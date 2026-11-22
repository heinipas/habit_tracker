from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .auth import make_require_api_key
from .config import Settings
from .db import connect, init_schema
from .models import HealthResponse, SyncRequest, SyncResponse
from .sync import now_ms, run_sync


@asynccontextmanager
async def lifespan(app: FastAPI):
    conn = connect(app.state.settings.db_path)
    try:
        init_schema(conn)
    finally:
        conn.close()
    yield


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or Settings.from_env()

    app = FastAPI(
        title="Habit Tracker Sync Server",
        version=settings.version,
        lifespan=lifespan,
    )
    app.state.settings = settings

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=settings.cors_origins,
            allow_methods=["GET", "POST", "OPTIONS"],
            allow_headers=["Authorization", "Content-Type"],
        )

    require_api_key = make_require_api_key(settings.api_key)

    @app.get("/api/v1/health", response_model=HealthResponse)
    def health() -> HealthResponse:
        return HealthResponse(status="ok", server_time=now_ms(), version=settings.version)

    @app.post(
        "/api/v1/sync",
        response_model=SyncResponse,
        dependencies=[Depends(require_api_key)],
    )
    def sync(request: SyncRequest) -> SyncResponse:
        return run_sync(settings.db_path, request)

    return app


app = create_app()
