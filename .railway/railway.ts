import { defineRailway, project, service } from "railway/iac";

export default defineRailway((context) => {
  const api = service("Lance Cash API", {
    build:
      "pnpm run typecheck:libs && pnpm --filter @workspace/api-server run typecheck && pnpm --filter @workspace/api-server run build",
    start: "pnpm --filter @workspace/api-server run start",
    healthcheck: "/api/healthz",
    healthcheckTimeout: 120,
    env: {
      NODE_ENV: "production",
    },
  });

  return project(context.projectName ?? "Lance Cash", {
    resources: [api],
  });
});
