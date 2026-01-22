/**
 * API helper functions for making authenticated requests
 */

// Global in-memory cache for GET requests
const requestCache = new Map<
  string,
  { data: any; timestamp: number; promise?: Promise<any> }
>();

// Track pending requests for deduplication
const pendingRequests = new Map<string, Promise<any>>();

// Cache statistics
let cacheStats = {
  hits: 0,
  misses: 0,
  deduplications: 0,
};

// Cache configuration
const CACHE_TTL = 5; // 5 seconds
const REQUEST_TIMEOUT = 10000; // 10 seconds

const getApiUrl = () => {
  if (typeof window !== "undefined") {
    // Browser'da: environment variable yoki window.location'dan HTTPS olish
    return (
      process.env.NEXT_PUBLIC_API_URL ||
      `https://${window.location.hostname.replace('clinic.', 'api.')}`
    );
  }
  // Server-side: environment variable yoki default HTTPS
  return process.env.NEXT_PUBLIC_API_URL || "https://api.jaclit.com";
};

/**
 * Generate cache key from endpoint and options
 */
const getCacheKey = (endpoint: string, options: RequestInit = {}): string => {
  const apiUrl = getApiUrl();
  const url = endpoint.startsWith("http") ? endpoint : `${apiUrl}${endpoint}`;
  const method = options.method || "GET";
  
  // ✅ Normalize headers: ignore cache-busting headers for cache key generation
  // This ensures that requests with/without cache-busting headers use the same cache key
  const headers = options.headers as Record<string, string> || {};
  const normalizedHeaders = {
    Authorization: headers.Authorization || '',
    'X-Tenant-Id': headers['X-Tenant-Id'] || '',
    // Ignore Cache-Control, Pragma, and other cache-busting headers
  };
  
  return `${method}:${url}:${JSON.stringify(normalizedHeaders)}`;
};

/**
 * Clear the request cache (useful for cache invalidation)
 */
export const clearCache = (endpoint?: string) => {
 
  if (endpoint) {
    const apiUrl = getApiUrl();
    // Normalize endpoint - remove leading slash if present
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const url = endpoint.startsWith("http") ? endpoint : `${apiUrl}${normalizedEndpoint}`;
    
    // ✅ More aggressive cache clearing: match by URL pattern (with or without query params)
    const keysToDelete: string[] = [];
    for (const key of requestCache.keys()) {
      // Extract base URL from cache key (format: "GET:http://...:headers")
      const keyParts = key.split(":");
      if (keyParts.length >= 2) {
        const keyUrl = keyParts.slice(1, -1).join(":"); // Get URL part (may contain multiple colons)
        // Match by base URL (without query params) or endpoint path
        const baseUrl = keyUrl.split("?")[0]; // Remove query params
        if (
          baseUrl.includes(url.split("?")[0]) || 
          baseUrl.includes(normalizedEndpoint) || 
          key.includes(normalizedEndpoint) ||
          key.includes(endpoint)
        ) {
          keysToDelete.push(key);
        }
      }
    }
    
    // Delete matched keys
    keysToDelete.forEach((key) => {
      requestCache.delete(key);
    });
    
    // Also clear any pending requests for this endpoint
    const pendingKeysToDelete: string[] = [];
    for (const key of pendingRequests.keys()) {
      const keyParts = key.split(":");
      if (keyParts.length >= 2) {
        const keyUrl = keyParts.slice(1, -1).join(":");
        const baseUrl = keyUrl.split("?")[0];
        if (
          baseUrl.includes(url.split("?")[0]) || 
          baseUrl.includes(normalizedEndpoint) || 
          key.includes(normalizedEndpoint) ||
          key.includes(endpoint)
        ) {
          pendingKeysToDelete.push(key);
        }
      }
    }
    pendingKeysToDelete.forEach((key) => {
      pendingRequests.delete(key);
    });
  } else {
    requestCache.clear();
    pendingRequests.clear();
  }
};

/**
 * Get cache statistics (for monitoring)
 */
export const getCacheStats = () => {
  return {
    ...cacheStats,
    hitRate:
      cacheStats.hits + cacheStats.misses > 0
        ? (
            (cacheStats.hits / (cacheStats.hits + cacheStats.misses)) *
            100
          ).toFixed(2) + "%"
        : "0%",
  };
};

/**
 * Logout handler
 */
export const handleLogout = async () => {
  // ✅ Memory'dan tozalash
  accessToken = null;
  accessTokenExpiry = null;
  memberData = null;
  tenantId = null;
  refreshPromise = null; // ✅ Refresh promise'ni ham tozalash

  // ✅ Backend'ga logout request
  try {
    await fetch(`${getApiUrl()}/iam/members/logout`, {
      method: "POST",
      credentials: "include", // ✅ Cookie'ni yuborish
    });
  } catch (error) {
    console.error("Logout error:", error);
  }

  // ✅ localStorage'dan tozalash
  if (typeof window !== "undefined") {
    localStorage.removeItem("erp_access_token");
    localStorage.removeItem("erp_token");
    localStorage.removeItem("access_token");
    localStorage.removeItem("erp_member_data");
    localStorage.removeItem("erp_tenant_id");
    localStorage.removeItem("tenantId");
  }

  // ✅ Redirect to login page
  if (typeof window !== "undefined") {
    window.location.href = "/login";
  }
};

/**
 * Clear authentication data and redirect to login
 */
const clearAuthAndRedirect = () => {
  handleLogout();
};

// ✅ Access token'ni memory'da saqlash (localStorage emas - XSS himoyasi)
let accessToken: string | null = null;
let accessTokenExpiry: number | null = null;
let memberData: any | null = null;
let tenantId: string | null = null;
// ✅ Refresh request'ni deduplicate qilish uchun
let refreshPromise: Promise<string | null> | null = null;

/**
 * Check if token is expired
 */
const isTokenExpired = (expiry: number | null): boolean => {
  if (!expiry) return true;
  return Date.now() >= expiry;
};

/**
 * Get access token (with automatic refresh)
 * @param skipLogout - Agar true bo'lsa, token yo'q bo'lganda logout qilmaslik (register page'lar uchun)
 */
export const getAccessToken = async (skipLogout: boolean = false): Promise<string | null> => {
  // ✅ Agar access token mavjud va valid bo'lsa, qaytarish
  if (accessToken && !isTokenExpired(accessTokenExpiry)) {
    return accessToken;
  }

  // ✅ Agar refresh request allaqachon davom etayotgan bo'lsa, uni kutish (deduplication)
  if (refreshPromise) {
    return refreshPromise;
  }

  // ✅ Refresh token bilan yangi access token olish
  refreshPromise = (async () => {
    try {
      const refreshUrl = `${getApiUrl()}/iam/members/refresh`;
      
      const response = await fetch(refreshUrl, {
        method: "POST",
        credentials: "include", // ✅ Cookie'ni yuborish
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        if (!data.access_token) {
          console.error("[getAccessToken] Refresh response missing access_token:", data);
          // Token yo'q bo'lsa, logout qilish (faqat skipLogout false bo'lsa)
          if (!skipLogout) {
            handleLogout();
          }
          return null;
        }
        
        accessToken = data.access_token;
        
        // ✅ Token expiry'ni hisoblash (15 minut default yoki response'dan)
        const expiresIn = data.expires_in 
          ? data.expires_in * 1000 // seconds to milliseconds
          : 15 * 60 * 1000; // Default 15 minutes
        accessTokenExpiry = Date.now() + expiresIn;

        // ✅ Member data'ni yangilash
        if (data.member) {
          memberData = data.member;
          tenantId = data.member.tenant_id;
          
          // ✅ Backward compatibility: localStorage'ga ham saqlash (faqat member data)
          if (typeof window !== "undefined") {
            localStorage.setItem("erp_member_data", JSON.stringify(data.member));
            localStorage.setItem("erp_tenant_id", data.member.tenant_id);
          }
        }

        return accessToken;
      } else {
        // Refresh token invalid yoki yo'q - faqat 401 bo'lsa logout qilish
        const errorData = await response.json().catch(() => ({}));
        console.error("[getAccessToken] Token refresh failed:", response.status, errorData);
        
        // Faqat 401 (Unauthorized) bo'lsa logout qilish (faqat skipLogout false bo'lsa)
        // 429 (Too Many Requests) yoki boshqa error'lar uchun null qaytarish (retry mumkin)
        if (response.status === 401 && !skipLogout) {
          handleLogout();
        }
        return null;
      }
    } catch (error) {
      console.error("[getAccessToken] Token refresh error:", error);
      // Network error bo'lsa, logout qilmaslik (retry mumkin)
      return null;
    } finally {
      // ✅ Refresh promise'ni tozalash
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

/**
 * Set access token (login'dan keyin)
 */
export const setAccessToken = (token: string, expiresIn?: number) => {
  accessToken = token;
  accessTokenExpiry = expiresIn
    ? Date.now() + expiresIn * 1000
    : Date.now() + 15 * 60 * 1000; // Default 15 minutes
};

/**
 * Set member data (login'dan keyin)
 */
export const setMemberData = (data: any) => {
  memberData = data;
  tenantId = data?.tenant_id || null;
  
  // ✅ Backward compatibility: localStorage'ga ham saqlash
  if (typeof window !== "undefined") {
    localStorage.setItem("erp_member_data", JSON.stringify(data));
    if (data?.tenant_id) {
      localStorage.setItem("erp_tenant_id", data.tenant_id);
    }
  }
};

/**
 * Get authentication token (backward compatibility)
 * @deprecated Use getAccessToken() instead
 */
export const getAuthToken = (): string | null => {
  // ✅ Memory'dan qaytarish (localStorage emas)
  return accessToken;
};

/**
 * Get tenant ID
 */
export const getTenantId = (): string | null => {
  // ✅ Memory'dan qaytarish, agar yo'q bo'lsa localStorage'dan
  if (tenantId) return tenantId;
  
  if (typeof window !== "undefined") {
    tenantId = localStorage.getItem("erp_tenant_id");
  }
  
  return tenantId;
};

/**
 * Get member data
 */
export const getMemberData = (): any | null => {
  // ✅ Memory'dan qaytarish, agar yo'q bo'lsa localStorage'dan
  if (memberData) return memberData;
  
  if (typeof window !== "undefined") {
    const stored = localStorage.getItem("erp_member_data");
    if (stored) {
      try {
        memberData = JSON.parse(stored);
        return memberData;
      } catch (e) {
        return null;
      }
    }
  }
  
  return null;
};

/**
 * Make an authenticated API request with timeout and deduplication
 */
export const apiRequest = async (
  endpoint: string,
  options: RequestInit = {}
): Promise<Response> => {
  const apiUrl = getApiUrl();
  const token = await getAccessToken(); // ✅ Async token olish
  const tenantIdValue = getTenantId();

  

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...options.headers,
  };

  // ✅ Cache-busting headers are only added when explicitly requested via options.headers
  // This allows normal requests to use browser HTTP cache for better performance

  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  } else {
    console.warn("[apiRequest] No token available for request to:", endpoint);
  }

  if (tenantIdValue) {
    (headers as Record<string, string>)["X-Tenant-Id"] = tenantIdValue;
  }

  const url = endpoint.startsWith("http") ? endpoint : `${apiUrl}${endpoint}`;
  const requestKey = getCacheKey(endpoint, { ...options, headers });

  // ✅ Credentials: include - Cookie'ni yuborish (refresh token)
  const requestOptions: RequestInit = {
    ...options,
    headers,
    credentials: options.credentials || "include",
  };

  // Check for pending request (deduplication)
  if (pendingRequests.has(requestKey)) {
    const pendingResponse = await pendingRequests.get(requestKey)!;
    return pendingResponse as Response;
  }

  // Create request with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

  const fetchPromise = fetch(url, {
    ...requestOptions, // ✅ requestOptions ishlatish
    signal: controller.signal,
  })
    .then((response) => {
      clearTimeout(timeoutId);
      pendingRequests.delete(requestKey);

      // Handle 401 Unauthorized (token expired or invalid)
      if (response.status === 401) {
        clearAuthAndRedirect();
        throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
      }

      return response;
    })
    .catch((error) => {
      clearTimeout(timeoutId);
      pendingRequests.delete(requestKey);

      // Handle timeout
      if (error.name === "AbortError") {
        throw new Error(`Request timeout after ${REQUEST_TIMEOUT}ms`);
      }

      // Handle network errors (CORS, connection refused, etc.)
      if (error.message?.includes("인증이 만료되었습니다")) {
        throw error;
      }
      throw new Error(`Network error: ${error.message || "Failed to fetch"}`);
    });

  // Store pending request for deduplication
  pendingRequests.set(requestKey, fetchPromise);

  return fetchPromise;
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
 * Make a GET request with caching and deduplication
 */
export const apiGet = async <T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  // ✅ Check if this is a force refresh request (has cache-busting headers)
  const isForceRefresh = options.headers && (
    (options.headers as Record<string, string>)["Cache-Control"]?.includes("no-cache") ||
    (options.headers as Record<string, string>)["Pragma"] === "no-cache"
  );
  
  const cacheKey = getCacheKey(endpoint, { ...options, method: "GET" });

  // ✅ Skip cache check if force refresh
  if (!isForceRefresh) {
    // Check cache first
    const cached = requestCache.get(cacheKey);
    if (cached) {
      const now = Date.now();
      const age = now - cached.timestamp;

      if (age < CACHE_TTL) {
        // ✅ Fresh cache - qaytarish
        cacheStats.hits++;
        return cached.data as T;
      } else {
        // ✅ Stale cache - o'chirish va yangi request yuborish (qaytarmaydi)
        requestCache.delete(cacheKey);
        // Cache miss deb hisoblanadi va yangi request yuboriladi
      }
    }
  } else {
    // ✅ Force refresh: Delete any existing cache entry for this endpoint
    // Clear cache for this endpoint (with and without query params)
    const baseUrl = endpoint.split("?")[0];
    const keysToDelete: string[] = [];
    for (const key of requestCache.keys()) {
      if (key.includes(baseUrl)) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach((key) => {
      requestCache.delete(key);
      pendingRequests.delete(key);
    });
  }

  // Check for pending request (deduplication)
  if (pendingRequests.has(cacheKey)) {
    cacheStats.deduplications++;
    return pendingRequests.get(cacheKey)! as Promise<T>;
  }

  cacheStats.misses++;

  // Make the request
  const requestPromise = apiRequest(endpoint, {
    method: "GET",
    ...options,
  })
    .then(async (response) => {
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
    })
    .then((data) => {
      // Cache successful GET requests
      requestCache.set(cacheKey, {
        data,
        timestamp: Date.now(),
      });
      pendingRequests.delete(cacheKey);
      return data as T;
    })
    .catch((error) => {
      pendingRequests.delete(cacheKey);
      throw error;
    });

  // Store pending request for deduplication
  pendingRequests.set(cacheKey, requestPromise);

  return requestPromise;
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

  const result = await response.json();

  // ✅ Auto-invalidate cache for product-related endpoints
  if (endpoint.includes("/products")) {
    clearCache("/products");
    clearCache("products");
    // ✅ Also clear outbound cache since outbound page uses products
    clearCache("/outbound/products");
    clearCache("outbound/products");
    
    // Set flag for inbound page refresh
    if (typeof window !== "undefined") {
      sessionStorage.setItem("inbound_force_refresh", "true");
      
      // Extract product ID from endpoint (e.g., "/products/123" -> "123")
      const productIdMatch = endpoint.match(/\/products\/([^\/]+)/);
      if (productIdMatch) {
        const productId = productIdMatch[1];
        // ✅ Dispatch custom event to notify inbound and outbound pages immediately
        window.dispatchEvent(
          new CustomEvent("productDeleted", {
            detail: { productId },
          })
        );
      }
    }
  }

  return result;
};
