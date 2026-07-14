import { defineRailway, github, postgres, preserve, project, service } from "railway/iac";

export default defineRailway(() => {
  const fintral = github("yvniel09/fintral");

  const lagoPostgres = postgres("lago-postgres");
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

    },
  });
  const fintralBackend = service("fintral-backend", {
    source: fintral,
    root: "backend",
    build: { buildEnvironment: "V3", builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
    replicas: { "us-east4-eqdc4a": 1 },
    domains: [],
    env: {
      ADMIN_EMAIL: preserve(),
      ADMIN_FULL_NAME: preserve(),
      ADMIN_PASSWORD: preserve(),
      AI_PIPELINE_FALLBACK_MODEL: preserve(),
      AI_PIPELINE_KEY: preserve(),
      AI_PIPELINE_MODEL: preserve(),
      AI_SIDECAR_FALLBACK_MODEL: preserve(),
      AI_SIDECAR_KEY: preserve(),
      AI_SIDECAR_MODEL: preserve(),
      ALANUBE_API_URL: preserve(),
      ALANUBE_JWT: preserve(),
      APP_JWT_SECRET_KEY: preserve(),
      BACKEND_URL: preserve(),
      BANK_ACCOUNT_HOLDER: preserve(),
      BANK_ACCOUNT_NUMBER: preserve(),
      BANK_NAME: preserve(),
      BILLING_EMAIL_FROM: preserve(),
      DATABASE_URL: preserve(),
      DOPPLER_CONFIG: preserve(),
      DOPPLER_ENVIRONMENT: preserve(),
      DOPPLER_PROJECT: preserve(),
      EMAIL_FROM: preserve(),
      ENVIRONMENT: preserve(),
      LAGO_API_KEY: preserve(),
      LAGO_API_URL: preserve(),
      LAGO_WEBHOOK_SECRET: preserve(),
      NEXT_PUBLIC_APP_URL: preserve(),
      ORG_NAME: preserve(),
      PUBLIC_APP_URL: preserve(),
      QUICKBOOKS_CLIENT_ID: preserve(),
      QUICKBOOKS_CLIENT_SECRET: preserve(),
      QUICKBOOKS_REDIRECT_URI: preserve(),
      REDIS_URL: preserve(),
      RESEND_API_KEY: preserve(),
      SUPABASE_SERVICE_ROLE_KEY: preserve(),
      SUPABASE_STORAGE_BUCKET: preserve(),
      SUPABASE_URL: preserve(),
      TELEGRAM_BOT_TOKEN: preserve(),
      TELEGRAM_CHAT_ID: preserve(),
      TELEGRAM_SUPPORT_BOT_TOKEN: preserve(),
      TELEGRAM_SUPPORT_CHAT_ID: preserve(),
      XERO_CLIENT_ID: preserve(),
      XERO_CLIENT_SECRET: preserve(),
      XERO_REDIRECT_URI: preserve(),
    },
  });

  return project("fintral-production", {
    resources: [lagoPostgres, fintralBackend, lago],
  });
});
