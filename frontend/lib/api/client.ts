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
    path.startsWith("/login") ||
    path.startsWith("/logout") ||
    path.startsWith("/signup") ||
    path.startsWith("/upload/public")
  );
}

export async function apiFetch<T>(
  input: string,
  init: RequestInitWithRaw = {}
): Promise<T> {
  const { raw, ...requestInit } = init;
  const response = await fetch(input, {
    credentials: "include",
    ...requestInit
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
        window.location.href = "/login";
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
