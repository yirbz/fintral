# Colores para la consola
GREEN := "\u{1b}[0;32m"
RED   := "\u{1b}[0;31m"
BLUE  := "\u{1b}[0;34m"
RESET := "\u{1b}[0m"

test-colors:
    @echo "{{GREEN}}Verde{{RESET}}"
    @echo "{{RED}}Rojo{{RESET}}"
    @echo "{{BLUE}}Azul{{RESET}}"

test:
    python -m pytest tests/

venv-test:
    venv/bin/python -m pytest tests/

install:
    pip install -r requirements.txt

up:
    docker compose up -d
    @echo "{{GREEN}} Servicios iniciados correctamente:{{RESET}}"
    @echo "{{BLUE}} App:   {{RESET}}http://localhost:$(docker compose port app 8000 | sed 's/.*://')"
    @echo "{{BLUE}} DB:    {{RESET}}localhost:$(docker compose port db 5432 | sed 's/.*://')"
    @echo "{{BLUE}} Redis: {{RESET}}localhost:$(docker compose port redis 6379 | sed 's/.*://')"

down:
    docker compose down
    @echo "{{RED}} Servicios detenidos.{{RESET}}"

lint:
    ruff check .

venv:
    @echo "{{GREEN}}Entrando al entorno virtual... (escribe 'exit' para salir){{RESET}}"
    bash --rcfile venv/bin/activate -i


integration-test:
    @echo "⚠️ Asegúrate de que el servidor esté corriendo (just up) antes de ejecutar estas pruebas."
    venv/bin/python tests/verify_ws_full.py
    venv/bin/python tests/verify_evolution.py