"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  apiGet,
  apiRequest,
} from "@/lib/api";
import { useNotifications } from "@/components/notifications/notification-provider";

type ListResponse = {
  items: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    entityType: string;
    entityId: string;
    readAt: string | null;
    createdAt: string;
  }>;
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
};

export default function NotificationsPage() {
  const ctx = useNotifications();
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet<ListResponse>("/notifications?limit=50&page=1", {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      setData(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const markRead = async (id: string) => {
    const res = await apiRequest(`/notifications/${id}/read`, {
      method: "PATCH",
    });
    if (!res.ok) return;
    await load();
    await ctx?.refreshUnread();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          알림
        </h1>
        <Link
          href="/"
          className="text-sm text-indigo-600 hover:text-indigo-500 dark:text-indigo-400"
        >
          대시보드
        </Link>
      </div>

      {loading && (
        <p className="text-sm text-slate-500">불러오는 중…</p>
      )}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      {!loading && !error && data && data.items.length === 0 && (
        <p className="text-sm text-slate-500">알림이 없습니다.</p>
      )}
      <ul className="space-y-3">
        {data?.items.map((n) => (
          <li
            key={n.id}
            className={`rounded-lg border p-4 dark:border-slate-700 ${
              n.readAt
                ? "border-slate-200 bg-white dark:bg-slate-900"
                : "border-indigo-200 bg-indigo-50/50 dark:border-indigo-900 dark:bg-indigo-950/30"
            }`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  {n.title}
                </p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                  {n.body}
                </p>
                <p className="mt-2 text-xs text-slate-400">
                  {new Date(n.createdAt).toLocaleString()}
                  {n.entityType === "order" && (
                    <>
                      {" · "}
                      <Link
                        href={`/inbound?highlightOrder=${encodeURIComponent(n.entityId)}`}
                        className="text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        입고로 이동
                      </Link>
                    </>
                  )}
                </p>
              </div>
              {!n.readAt && (
                <button
                  type="button"
                  onClick={() => void markRead(n.id)}
                  className="shrink-0 rounded-md bg-slate-200 px-3 py-1 text-xs font-medium text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
                >
                  읽음
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
