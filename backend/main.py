import os

import uvicorn

from app.core.logging import setup_logging

logger = setup_logging()

from app import app  # noqa: E402 — must be imported after logging setup


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    logger.info("Starting Fintral server on 0.0.0.0:%d", port)
    uvicorn.run(app, host="0.0.0.0", port=port)
