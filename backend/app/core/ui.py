import os

from app.config import FINTRAL_DATA_DIR


def ensure_runtime_dirs() -> None:
    os.makedirs(os.path.join(FINTRAL_DATA_DIR, "static"), exist_ok=True)
