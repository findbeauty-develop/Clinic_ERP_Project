const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

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

    if (!response.ok) {
      const errorText = await response.text().catch(() => response.statusText);
      throw new Error(`API Error (${response.status}): ${errorText}`);
    }

    return response.json();
  } catch (error: any) {
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

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
}

