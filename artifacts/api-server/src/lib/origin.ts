import type { IncomingMessage } from "node:http";

function parseConfiguredOrigins(): Set<string> {
  const values = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return new Set(
    values.map((value) => {
      let url: URL;
      try {
        url = new URL(value);
      } catch {
        throw new Error(
          "CORS_ALLOWED_ORIGINS must contain comma-separated HTTP(S) origins.",
        );
      }

      if (
        !["http:", "https:"].includes(url.protocol) ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "CORS_ALLOWED_ORIGINS entries must be origins without paths or query strings.",
        );
      }

      return url.origin;
    }),
  );
}

const configuredOrigins = parseConfiguredOrigins();

export function isConfiguredOrigin(origin: string | undefined): boolean {
  if (!origin) return false;

  try {
    return configuredOrigins.has(new URL(origin).origin);
  } catch {
    return false;
  }
}

export function isTrustedOrigin(request: Pick<IncomingMessage, "headers">): boolean {
  const origin = request.headers.origin;
  if (typeof origin !== "string") return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return false;
  }

  if (isConfiguredOrigin(origin)) return true;

  const forwardedHost = request.headers["x-forwarded-host"];
  const hosts = [
    request.headers.host,
    Array.isArray(forwardedHost)
      ? forwardedHost[0]
      : forwardedHost?.split(",")[0],
  ]
    .filter((host): host is string => Boolean(host))
    .map((host) => host.trim().toLowerCase());

  return hosts.includes(originHost);
}
