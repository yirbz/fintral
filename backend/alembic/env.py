import logging
from logging.config import fileConfig

from alembic import context

# Alembic Config object
config = context.config

# Logging from alembic.ini
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# ── App metadata ──────────────────────────────────────────────────────────
from app.config import DATABASE_URL  # noqa: E402
from app.database import Base  # noqa: E402

target_metadata = Base.metadata

# ── Override DB URL from app config ───────────────────────────────────────
config.set_main_option("sqlalchemy.url", DATABASE_URL)


logger = logging.getLogger("alembic.env")


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode — emit SQL without a connection."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        include_schemas=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations with a live connection."""
    from sqlalchemy import create_engine

    engine = create_engine(
        config.get_main_option("sqlalchemy.url"),
        pool_pre_ping=True,
        pool_recycle=300,
    )

    with engine.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            include_schemas=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
