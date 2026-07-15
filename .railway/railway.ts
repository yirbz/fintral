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
  return project("fintral-production", {
    resources: [lagoPostgres, lago],
  });
});
