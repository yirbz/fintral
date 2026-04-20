test:
    python -m pytest tests/

venv-test:
    venv/bin/python -m pytest tests/

install:
    pip install -r requirements.txt

up:
    docker compose up -d
    @echo "🚀 ¡Servicios iniciados!"
    @echo "🌐 App:   http://localhost:$(docker compose port app 8000 | sed 's/.*://')"
    @echo "🐘 DB:    localhost:$(docker compose port db 5432 | sed 's/.*://')"
    @echo "🧠 Redis: localhost:$(docker compose port redis 6379 | sed 's/.*://')"

down:
    docker compose down
    @echo "🛑 Servicios detenidos."