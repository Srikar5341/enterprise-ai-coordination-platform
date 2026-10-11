"""FastAPI application factory and runtime bootstrap."""

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.router import api_router
from src.core.config import get_settings
from src.core.errors import register_error_handlers
from src.core.logging import setup_logging

# Configure logging at application initialization
setup_logging()

settings = get_settings()


def create_application() -> FastAPI:
    """Instantiate and configure the FastAPI application."""
    app = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        docs_url="/docs",
        openapi_url="/openapi.json",
        description="Backend platform for AI-powered team coordination, task allocation, and recovery planning.",
    )

    # CORS configuration
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if settings.ENVIRONMENT == "development" else ["http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register centralized structured error handling
    register_error_handlers(app)

    # Mount master versioned API router under /api/v1
    app.include_router(api_router, prefix=settings.API_V1_PREFIX)

    return app


app = create_application()

if __name__ == "__main__":
    uvicorn.run(
        "src.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG,
    )
