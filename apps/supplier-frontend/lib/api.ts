const apiUrl = process.env.NEXT_PUBLIC_API_URL || "https://api-supplier.jaclit.com";

/**
 * Clear authentication data and redirect to login
 */
const clearAuthAndRedirect = () => {
  if (typeof window !== "undefined") {
    // Clear all auth-related data
    localStorage.removeItem("supplier_access_token");
    localStorage.removeItem("supplier_manager_data");
    localStorage.removeItem("supplier_token");
    localStorage.removeItem("access_token");
    
    // Redirect to login page
    // Use window.location.href for full page reload
    window.location.href = "/login";
  }
};

export async function apiGet<T>(endpoint: string): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("supplier_access_token")
      : null;

  try {
    const response = await fetch(`${apiUrl}${endpoint}`, {
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });

    // Handle 401 Unauthorized (token expired or invalid)
    if (response.status === 401) {
      clearAuthAndRedirect();
      throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
    // Re-throw auth expiration error
    if (error.message?.includes("인증이 만료되었습니다")) {
      throw error;
    }
    // Handle network errors (connection refused, etc.)
    if (error.message?.includes("Failed to fetch") || error.message?.includes("ERR_CONNECTION_REFUSED")) {
      throw new Error(
        `서버에 연결할 수 없습니다. 백엔드 서버(${apiUrl})가 실행 중인지 확인해주세요.`
      );
    }
    throw error;
  }
}

export async function apiPost<T>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("supplier_access_token")
      : null;

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  // Handle 401 Unauthorized (token expired or invalid)
  if (response.status === 401) {
    clearAuthAndRedirect();
    throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export async function apiPut<T>(
  endpoint: string,
  data: unknown
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("supplier_access_token")
      : null;

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });

  // Handle 401 Unauthorized (token expired or invalid)
  if (response.status === 401) {
    clearAuthAndRedirect();
    throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

export async function apiDelete<T>(
  endpoint: string,
  data?: unknown
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("supplier_access_token")
      : null;

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(data ? { body: JSON.stringify(data) } : {}),
  });

  // Handle 401 Unauthorized (token expired or invalid)
  if (response.status === 401) {
    clearAuthAndRedirect();
    throw new Error("인증이 만료되었습니다. 다시 로그인해주세요.");
  }

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

