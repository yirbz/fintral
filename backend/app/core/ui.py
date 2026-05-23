import os


def ensure_runtime_dirs() -> None:
    os.makedirs("static", exist_ok=True)
