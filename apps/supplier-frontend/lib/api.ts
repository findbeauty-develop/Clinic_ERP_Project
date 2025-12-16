const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3002";

export async function apiGet<T>(endpoint: string): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("supplier_access_token")
      : null;

  const response = await fetch(`${apiUrl}${endpoint}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`API Error: ${response.statusText}`);
  }

  return response.json();
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

