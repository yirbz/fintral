FROM getlago/front:latest AS lago-front

FROM getlago/api:v1.39.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    supervisor \
    redis-server \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && rm -f /etc/nginx/sites-enabled/default

COPY --from=lago-front /usr/share/nginx/html /usr/share/nginx/html
COPY --from=lago-front /docker-entrypoint.sh /docker-entrypoint-front.sh
COPY --from=lago-front /docker-entrypoint.d /docker-entrypoint.d

COPY lago/nginx.conf /etc/nginx/conf.d/lago.conf
COPY lago/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY lago/start.sh /app/start.sh

RUN chmod +x /app/start.sh && mkdir -p /app/config/keys

ENV RAILS_ENV=production
ENV RAILS_LOG_TO_STDOUT=true
ENV RAILS_SERVE_STATIC_FILES=true

EXPOSE 80

CMD ["/bin/bash", "/app/start.sh"]
