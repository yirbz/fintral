import os
from fastapi.templating import Jinja2Templates


def ensure_runtime_dirs() -> None:
    os.makedirs("static", exist_ok=True)
    os.makedirs("templates", exist_ok=True)
    os.makedirs("uploads", exist_ok=True)


templates = Jinja2Templates(directory="templates")
