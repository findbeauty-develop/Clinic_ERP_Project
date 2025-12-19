/**
 * API helper functions for making authenticated requests
 */

const getApiUrl = () => {
  // Runtime'da o'qish uchun: avval window.location'dan, keyin process.env'dan
  if (typeof window !== "undefined") {
    // Client-side: window.location orqali backend URL'ni aniqlash
    const hostname = window.location.hostname;
    const port = window.location.port;

    // Agar VPS'da ishlayotgan bo'lsa (72.60.108.46), backend port 3000
    if (hostname === "72.60.108.46" || hostname.includes("72.60.108.46")) {
      return `http://${hostname}:3000`;
    }

    // Agar localhost bo'lsa
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return "http://localhost:3000";
    }

    // Boshqa holatda: build vaqtidagi environment variable'dan
    return process.env.NEXT_PUBLIC_API_URL || `http://${hostname}:3000`;
  }

  // Server-side: process.env'dan
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;

  if (!apiUrl) {
    console.error("❌ NEXT_PUBLIC_API_URL is not configured");
    throw new Error(
      "API base URL is not configured. Please set NEXT_PUBLIC_API_URL in .env.local file"
    );
  }

  return apiUrl;
};
/**
 * Get authentication token from localStorage
 */
export const getAuthToken = (): string | null => {
  if (typeof window === "undefined") return null;
  return (
    window.localStorage.getItem("erp_access_token") ??
    window.localStorage.getItem("access_token") ??
    null
  );
};

/**
 * Get tenant ID from localStorage (stored after member login)
 */
export const getTenantId = (): string | null => {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("erp_tenant_id");
};

/**
 * Get member data from localStorage
 */
export const getMemberData = (): any | null => {
  if (typeof window === "undefined") return null;
  const memberData = localStorage.getItem("erp_member_data");
  return memberData ? JSON.parse(memberData) : null;
};

/**
 * Make an authenticated API request
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const apiUrl = getApiUrl();
  const token = getAuthToken();
  const tenantId = getTenantId();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  if (tenantId) {
    (headers as Record<string, string>)["X-Tenant-Id"] = tenantId;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${apiUrl}${endpoint}`;

  try {
    return await fetch(url, {
      ...options,
      headers,
    });
  } catch (networkError: any) {
    // Handle network errors (CORS, connection refused, etc.)
    throw new Error(
      `Network error: ${networkError.message || "Failed to fetch"}`
    );
  }
};

/**
 * Make a POST request
 */
export const apiPost = async <T = any>(
  endpoint: string,
  data: any,
  options: RequestInit = {}
): Promise<T> => {
  const response = await apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
    ...options,
  });

  if (!response.ok) {
    let errorMessage = "Request failed";
    try {
      const error = await response.json();
      errorMessage =
        typeof error?.message === "string"
          ? error.message
          : `HTTP ${response.status}: ${response.statusText}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText || "Unknown error"}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

/**
 * Make a PUT request
 */
export const apiPut = async <T = any>(
  endpoint: string,
  data: any,
  options: RequestInit = {}
): Promise<T> => {
  const response = await apiRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
    ...options,
  });

  if (!response.ok) {
    let errorMessage = "Request failed";
    try {
      const error = await response.json();
      errorMessage =
        typeof error?.message === "string"
          ? error.message
          : `HTTP ${response.status}: ${response.statusText}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText || "Unknown error"}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

/**
 * Make a GET request
 */
export const apiGet = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await apiRequest(endpoint, {
    method: "GET",
    ...options,
  });

  if (!response.ok) {
    let errorMessage = "Request failed";
    try {
      const error = await response.json();
      errorMessage =
        typeof error?.message === "string"
          ? error.message
          : `HTTP ${response.status}: ${response.statusText}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText || "Unknown error"}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};

/**
 * Make a DELETE request
 */
export const apiDelete = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const response = await apiRequest(endpoint, {
    method: "DELETE",
    ...options,
  });

  if (!response.ok) {
    let errorMessage = "Request failed";
    try {
      const error = await response.json();
      errorMessage =
        typeof error?.message === "string"
          ? error.message
          : `HTTP ${response.status}: ${response.statusText}`;
    } catch {
      errorMessage = `HTTP ${response.status}: ${response.statusText || "Unknown error"}`;
    }
    throw new Error(errorMessage);
  }

  return response.json();
};
