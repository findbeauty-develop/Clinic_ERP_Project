"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { Bell, X, RotateCw } from "lucide-react";
import { apiGet, apiPatch } from "../../lib/api";

type NotifItem = {
  id: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotifListResponse = {
  items: NotifItem[];
  total: number;
  hasMore: boolean;
};

const PAGE_TITLES: Record<string, string> = {
  "/": "대시보드",
  "/orders": "주문",
  "/returns": "반납",
  "/exchanges": "반품 및 교환",
  "/products": "제품",
  "/settlement": "정산",
  "/settings": "설정",
  "/profile": "프로필",
};

const HIDE_HEADER_PAGES = [
  "/login",
  "/register",
  "/register/company",
  "/register/contact",
  "/register/complete",
];

export function Header() {
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [notifItems, setNotifItems] = useState<NotifItem[]>([]);
  const [notifTab, setNotifTab] = useState<"unread" | "all">("unread");
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const prevUnreadRef = useRef(0);

  const shouldHide = HIDE_HEADER_PAGES.some((p) => pathname.startsWith(p));

  const pageTitle =
    Object.entries(PAGE_TITLES).find(([path]) =>
      path === "/" ? pathname === "/" : pathname.startsWith(path),
    )?.[1] ?? "";

  const fetchUnreadCount = useCallback(async () => {
    try {
      const data = await apiGet<{ count: number }>(
        "/supplier/notifications/unread-count",
      );
      const newCount = typeof data?.count === "number" ? data.count : 0;
      setUnreadCount(newCount);
      return newCount;
    } catch {
      return 0;
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiGet<NotifListResponse>(
        "/supplier/notifications?limit=50&page=1",
      );
      setNotifItems(res?.items ?? []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await apiPatch(`/supplier/notifications/${id}/read`);
      setNotifItems((prev) =>
        prev.map((n) =>
          n.id === id ? { ...n, readAt: new Date().toISOString() } : n,
        ),
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  }, []);

  const markAllRead = useCallback(async () => {
    const unread = notifItems.filter((n) => !n.readAt);
    await Promise.all(
      unread.map((n) =>
        apiPatch(`/supplier/notifications/${n.id}/read`).catch(() => {}),
      ),
    );
    setNotifItems((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  }, [notifItems]);

  const openPanel = useCallback(() => {
    setShowPanel(true);
    void fetchNotifications();
  }, [fetchNotifications]);

  // Poll every 5s: unread count + panel ichidagi ro'yxatni yangilash
  useEffect(() => {
    if (shouldHide) return;

    const tick = async () => {
      const newCount = await fetchUnreadCount();
      // yangi notification kelganda - ro'yxatni qayta yuklash
      if (newCount > prevUnreadRef.current) {
        prevUnreadRef.current = newCount;
        void fetchNotifications();
      } else {
        prevUnreadRef.current = newCount;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), 5000);
    return () => clearInterval(id);
  }, [fetchUnreadCount, fetchNotifications, shouldHide]);

  // Close panel when clicking outside
  useEffect(() => {
    if (!showPanel) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setShowPanel(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showPanel]);

  if (shouldHide) return null;

  const filteredNotifs =
    notifTab === "unread" ? notifItems.filter((n) => !n.readAt) : notifItems;

  return (
    <header className="sticky top-0 z-30 flex h-20 items-center justify-between border-b border-slate-200 bg-slate-50 px-4 lg:px-6 shadow-sm">
      {/* Left — page title (pushed right on mobile to avoid hamburger overlap) */}
      <div className="pl-12 lg:pl-0">
        <h1 className="text-base font-semibold ml-2 mt-2 text-slate-800">
          {pageTitle}
        </h1>
      </div>

      {/* Right — actions */}
      <div className="flex items-center gap-1">
        {/* Refresh button */}
        <button
          type="button"
          onClick={() => {
            setRefreshing(true);
            window.location.reload();
          }}
          className="flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
          aria-label="새로고침"
        >
          <RotateCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        </button>

        {/* Bell icon */}
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={openPanel}
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
            aria-label="알림"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-0.5 text-[9px] font-bold text-white leading-none">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>

          {/* Notification dropdown panel */}
          {showPanel && (
            <div className="absolute right-0 top-full mt-2 w-96 rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200 overflow-hidden">
              {/* Panel header */}
              <div className="flex items-center justify-between bg-gradient-to-r from-indigo-500 to-purple-600 px-5 py-4">
                <h2 className="text-base font-bold text-white">알람</h2>
                <button
                  onClick={() => setShowPanel(false)}
                  className="rounded-lg p-1 text-white/70 hover:bg-white/20 hover:text-white transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Tabs + 모두읽음 */}
              <div className="flex items-center justify-between border-b border-slate-100 bg-white px-5 py-2">
                <div className="flex gap-5">
                  {(["unread", "all"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setNotifTab(tab)}
                      className={`pb-1 text-sm font-medium transition-colors ${
                        notifTab === tab
                          ? "border-b-2 border-indigo-600 text-indigo-600"
                          : "text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      {tab === "unread" ? "미확인" : "전체"}
                    </button>
                  ))}
                </div>
                <button
                  onClick={markAllRead}
                  className="text-xs text-slate-400 hover:text-slate-700 transition-colors"
                >
                  모두읽음
                </button>
              </div>

              {/* Notification list */}
              <div className="max-h-[420px] overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center py-10">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                  </div>
                ) : filteredNotifs.length === 0 ? (
                  <p className="py-10 text-center text-sm text-slate-400">
                    {notifTab === "unread"
                      ? "읽지 않은 알림이 없습니다."
                      : "알림이 없습니다."}
                  </p>
                ) : (
                  filteredNotifs.map((notif) => {
                    const lines = notif.body.split("\n").filter(Boolean);
                    const actionLine = lines[lines.length - 1] ?? "";
                    const descLines = lines.slice(0, -1).join(" ");
                    const isNew = actionLine.includes("새 주문");
                    const isUnread = !notif.readAt;
                    const dateStr = notif.createdAt
                      ? new Date(notif.createdAt).toLocaleDateString("ko-KR", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "";

                    return (
                      <button
                        key={notif.id}
                        onClick={() => markRead(notif.id)}
                        className={`w-full border-b border-slate-100 px-5 py-4 text-left transition hover:bg-slate-50 ${
                          isUnread ? "bg-indigo-50/40" : "bg-white"
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900 leading-tight">
                            {notif.title}
                          </span>
                          <span className="flex-shrink-0 text-[11px] text-slate-400">
                            {dateStr}
                          </span>
                        </div>
                        {descLines && (
                          <p className="mt-1 text-xs text-slate-600 leading-snug">
                            {descLines}
                          </p>
                        )}
                        {actionLine && (
                          <p
                            className={`mt-1 text-xs font-medium ${
                              isNew ? "text-indigo-600" : "text-slate-500"
                            }`}
                          >
                            {actionLine}
                          </p>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
