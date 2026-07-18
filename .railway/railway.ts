import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const fintral = github("yvniel09/fintral");

  const lagoPostgres = postgres("lago-postgres");
  const fintralBackend = service("fintral-backend", {
    source: fintral,
    root: "backend",
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "backend/Dockerfile" },
    replicas: { "us-east4-eqdc4a": 1 },
    domains: ["api.fintral.app"],
    env: {
      // Core
      DATABASE_URL: preserve(),
      REDIS_URL: preserve(),
      APP_JWT_SECRET_KEY: preserve(),
      ADMIN_EMAIL: preserve(),
      ADMIN_PASSWORD: preserve(),
      ADMIN_FULL_NAME: preserve(),
      ENVIRONMENT: preserve(),
      BACKEND_URL: preserve(),
      PUBLIC_APP_URL: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      ORG_NAME: preserve(),
      // Auth — Supabase
      SUPABASE_URL: preserve(),
      SUPABASE_ANON_KEY: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET: preserve(),
      // AI pipeline
      AI_PIPELINE_KEY: preserve(),
      AI_PIPELINE_MODEL: preserve(),
      AI_PIPELINE_FALLBACK_MODEL: preserve(),
      AI_SIDECAR_KEY: preserve(),
      AI_SIDECAR_MODEL: preserve(),
      AI_SIDECAR_FALLBACK_MODEL: preserve(),
      // Lago billing
      LAGO_API_KEY: preserve(),
      LAGO_API_URL: preserve(),
      LAGO_WEBHOOK_SECRET: preserve(),
      SECRET_KEY_BASE: preserve(),
      RAILS_ENV: preserve(),
      RAILS_LOG_TO_STDOUT: preserve(),
      // Email
      EMAIL_FROM: preserve(),
      BILLING_EMAIL_FROM: preserve(),
      RESEND_API_KEY: preserve(),
      // MIO payments
      MIO_CLIENT_ID: preserve(),
      MIO_CLIENT_SECRET: preserve(),
      MIO_API_BASE_URL: preserve(),
      MIO_AUTH_URL: preserve(),
      MIO_WEBHOOK_URL: preserve(),
      MIO_WEBHOOK_SECRET: preserve(),
      MIO_ENVIRONMENT: preserve(),
      MIO_SUCCESS_REDIRECT: preserve(),
      MIO_FAILED_REDIRECT: preserve(),
      // Banking
      BANK_NAME: preserve(),
      BANK_ACCOUNT_NUMBER: preserve(),
      BANK_ACCOUNT_HOLDER: preserve(),
      BANCO_POPULAR_API_KEY: preserve(),
      BANCO_POPULAR_SECRET_KEY: preserve(),
      // Integrations
      ALANUBE_JWT: preserve(),
      ALANUBE_API_URL: preserve(),
      XERO_CLIENT_ID: preserve(),
      XERO_CLIENT_SECRET: preserve(),
      XERO_REDIRECT_URI: preserve(),
      QUICKBOOKS_CLIENT_ID: preserve(),
      QUICKBOOKS_CLIENT_SECRET: preserve(),
      QUICKBOOKS_REDIRECT_URI: preserve(),
      QUICKBOOKS_SANDBOX: preserve(),
      // Telegram
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_CHAT_ID: preserve(),
      TELEGRAM_SUPPORT_BOT_TOKEN: preserve(),
      TELEGRAM_SUPPORT_CHAT_ID: preserve(),
      // Doppler
      DOPPLER_PROJECT: preserve(),
      DOPPLER_CONFIG: preserve(),
      DOPPLER_ENVIRONMENT: preserve(),
    },
  });
  const lago = service("lago", {
    source: fintral,
    root: "/",
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "lago/Dockerfile" },
    replicas: { "us-east4-eqdc4a": 1 },
    env: {
      DATABASE_URL: preserve(),
      LAGO_DATABASE_URL: preserve(),
      RAILS_ENV: preserve(),
      RAILS_LOG_TO_STDOUT: preserve(),
      SECRET_KEY_BASE: preserve(),
      LAGO_CREATE_ORG: preserve(),
      LAGO_ORG_NAME: preserve(),
      LAGO_ORG_USER_EMAIL: preserve(),
      LAGO_ORG_USER_PASSWORD: preserve(),
      LAGO_ORG_API_KEY: preserve(),
      PORT: "80",
      // ClickHouse now runs embedded inside this container (supervisord)
      LAGO_CLICKHOUSE_HOST: "127.0.0.1",
      LAGO_CLICKHOUSE_PORT: "8123",
      LAGO_CLICKHOUSE_DATABASE: "lago",
      LAGO_CLICKHOUSE_USERNAME: "default",
      LAGO_CLICKHOUSE_PASSWORD: "",
      LAGO_CLICKHOUSE_SSL: "false",
      LAGO_CLICKHOUSE_MIGRATIONS_ENABLED: "true",
    },
  });

  return project("fintral-production", {
    resources: [lagoPostgres, fintralBackend, lago],
  });
});
