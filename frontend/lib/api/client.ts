export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

type RequestInitWithRaw = RequestInit & { raw?: boolean };

function isOnPublicPage(): boolean {
  if (typeof window === "undefined") return true;
  const path = window.location.pathname;
  return (
    path === "/" ||
    path.startsWith("/login") ||
    path.startsWith("/logout") ||
    path.startsWith("/signup") ||
    path.startsWith("/plans") ||
    path.startsWith("/upload/public") ||
    path.startsWith("/forgot") ||
    path.startsWith("/docs") ||
    path.startsWith("/verify")
  );
}

function getStoredOrgId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem("fintral_active_org");
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  input: string,
  init: RequestInitWithRaw = {}
): Promise<T> {
  const { raw, ...requestInit } = init;

  // Build headers — always send the active org if we have one
  const headers = new Headers(requestInit.headers);
  const orgId = getStoredOrgId();
  if (orgId) {
    headers.set("X-Organization-Id", orgId);
  }

  const response = await fetch(input, {
    credentials: "include",
    ...requestInit,
    headers,
  });

  if (!response.ok) {
    let errorPayload: unknown = null;
    let errorMessage = `Request failed with status ${response.status}`;
    try {
      errorPayload = await response.json();
      if (typeof errorPayload === "object" && errorPayload !== null && "detail" in errorPayload) {
        errorMessage = String((errorPayload as { detail: unknown }).detail);
      }
    } catch {
      // Body already consumed or not JSON - use fallback message
    }

    if (response.status === 401 && !isOnPublicPage()) {
      try {
        window.dispatchEvent(new CustomEvent("auth:unauthorized", { detail: { path: input, message: errorMessage } }));
      } catch { /* noop */ }
      throw new ApiError(errorMessage, response.status, errorPayload);
    }

    throw new ApiError(errorMessage, response.status, errorPayload);
  }

  if (raw) {
    return response as unknown as T;
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
