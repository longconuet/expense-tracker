import type { ApiMeta, ApiResponse } from "@expense-tracker/shared";

/**
 * API client thống nhất của web:
 * - Đọc envelope { success, data, error } (type từ @expense-tracker/shared)
 * - Access token giữ in-memory (biến module) — KHÔNG lưu localStorage
 * - 401: tự gọi POST /api/auth/refresh (cookie httpOnly do trình duyệt tự gửi), retry đúng 1 lần
 * - Refresh fail: xoá token + gọi handler onSessionExpired (app tự xoá store + navigate /login)
 */

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

let accessToken: string | null = null;
let refreshInFlight: Promise<string | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** Gán access token (store auth gọi sau login/register/refresh). */
export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function getAccessToken(): string | null {
  return accessToken;
}

/** Đăng ký handler "mất phiên hoàn toàn" (refresh fail) — app đăng ký nơi có router. */
export function setSessionExpiredHandler(handler: () => void): void {
  sessionExpiredHandler = handler;
}

export interface ApiFetchOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  /** Gắn header `Authorization: Bearer` — route /auth đặt false. */
  auth?: boolean;
}

async function doFetch(path: string, method: string, body: unknown, auth: boolean): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(auth && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    // fetch chỉ reject khi lỗi mạng (lỗi HTTP vẫn trả về Response bình thường)
    throw new ApiError("NETWORK_ERROR", "Không kết nối được máy chủ, vui lòng kiểm tra mạng.", 0);
  }
  return response;
}

async function parseEnvelope<T>(response: Response): Promise<{ data: T; meta?: ApiMeta }> {
  let body: ApiResponse<T> | null = null;
  try {
    body = (await response.json()) as ApiResponse<T>;
  } catch {
    // Response không phải JSON — rơi xuống throw bên dưới kèm status HTTP
  }

  if (response.ok && body?.success) {
    return { data: body.data as T, meta: body.meta };
  }

  throw new ApiError(
    body?.error?.code ?? "UNKNOWN_ERROR",
    body?.error?.message ?? `Yêu cầu thất bại (HTTP ${response.status})`,
    response.status,
  );
}

/**
 * Làm mới access token qua POST /api/auth/refresh — refresh cookie (httpOnly) do trình
 * duyệt tự gửi, FE không chạm. Các request gọi đồng thời cùng dùng 1 request refresh
 * duy nhất (tránh refresh trùng). Trả về token mới, hoặc null nếu phiên không còn hợp lệ.
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const data = await apiFetch<{ user: unknown; accessToken: string }>("/api/auth/refresh", {
          method: "POST",
          auth: false,
        });
        setAccessToken(data.accessToken);
        return data.accessToken;
      } catch {
        setAccessToken(null);
        return null;
      } finally {
        // Giải phóng sau khi request đã settle — request sau có thể refresh lại
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

/**
 * Gọi fetch + xử lý 401: refresh 1 lần rồi retry đúng 1 lần.
 * Refresh fail: xoá token, gọi onSessionExpired, trả về response 401 gốc
 * (parseEnvelope bên dưới sẽ ném ApiError).
 */
async function fetchWithRetry(path: string, method: string, body: unknown, auth: boolean): Promise<Response> {
  let response = await doFetch(path, method, body, auth);

  if (response.status === 401 && auth) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Retry 1 lần — header Authorization tự gắn token mới
      response = await doFetch(path, method, body, auth);
    } else {
      setAccessToken(null);
      sessionExpiredHandler?.();
    }
  }

  return response;
}

/**
 * Gọi API JSON, trả về data. Lỗi (API/mạng) → ném ApiError.
 */
export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { data } = await apiFetchWithMeta<T>(path, options);
  return data;
}

/**
 * Gọi API JSON, trả cả data + meta (phân trang). Dùng cho endpoint có `meta`
 * trong envelope (VD danh sách expenses).
 */
export async function apiFetchWithMeta<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<{ data: T; meta?: ApiMeta }> {
  const response = await fetchWithRetry(
    path,
    options.method ?? "GET",
    options.body,
    options.auth ?? true,
  );
  return parseEnvelope<T>(response);
}
