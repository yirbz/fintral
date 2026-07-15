FROM getlago/front:latest AS lago-front

FROM getlago/api:v1.39.0

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    redis-server \
    sudo \
    curl \
    gnupg \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

RUN curl -fsSL https://packages.clickhouse.com/rpm/lts/repodata/repomd.xml.key \
    | gpg --dearmor -o /usr/share/keyrings/clickhouse-keyring.gpg \
    && echo "deb [signed-by=/usr/share/keyrings/clickhouse-keyring.gpg] https://packages.clickhouse.com/deb stable main" > /etc/apt/sources.list.d/clickhouse.list \
    && apt-get update && apt-get install -y --no-install-recommends \
       -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" \
       clickhouse-server clickhouse-client \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /var/lib/clickhouse /var/log/clickhouse-server

ENV DEBIAN_FRONTEND=

COPY --from=lago-front /usr/share/nginx/html /usr/share/nginx/html
COPY --from=lago-front /docker-entrypoint.sh /docker-entrypoint-front.sh
COPY --from=lago-front /docker-entrypoint.d /docker-entrypoint.d

COPY lago/nginx.conf /etc/nginx/conf.d/lago.conf
COPY lago/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY lago/clickhouse-config.xml /etc/clickhouse-server/config.d/override.xml
COPY lago/start.sh /app/start.sh

RUN chmod +x /app/start.sh && mkdir -p /app/config/keys

ENV RAILS_ENV=production
ENV RAILS_LOG_TO_STDOUT=true
ENV RAILS_SERVE_STATIC_FILES=true

EXPOSE 80

CMD ["/bin/bash", "/app/start.sh"]
