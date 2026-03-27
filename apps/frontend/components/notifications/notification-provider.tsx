"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { io, type Socket } from "socket.io-client";
import {
  getAccessToken,
  getApiUrl,
  apiGet,
} from "@/lib/api";
import { sendDesktopNotificationIfTauri } from "@/lib/tauri-desktop-notification";
import { sendBrowserNotificationIfPermitted } from "@/lib/browser-notification";

export type NotificationItemDto = {
  id: string;
  tenantId: string;
  type: string;
  title: string;
  body: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown> | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationContextValue = {
  unreadCount: number;
  refreshUnread: () => Promise<void>;
  socket: Socket | null;
};

const NotificationContext = createContext<NotificationContextValue | null>(
  null
);

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({
  children,
  enabled,
}: {
  children: React.ReactNode;
  enabled: boolean;
}) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [socket, setSocket] = useState<Socket | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!enabled) return;
    try {
      const data = await apiGet<{ count: number }>("/notifications/unread-count", {
        headers: {
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
        },
      });
      setUnreadCount(typeof data?.count === "number" ? data.count : 0);
    } catch {
      /* ignore */
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;

    const sockRef: { current: Socket | null } = { current: null };
    let cancelled = false;

    void (async () => {
      const token = await getAccessToken(true);
      if (!token || cancelled) return;

      const base = getApiUrl();
      const s = io(`${base}/notifications`, {
        path: "/socket.io",
        auth: { token },
        transports: ["websocket", "polling"],
      });
      sockRef.current = s;

      if (cancelled) {
        s.removeAllListeners();
        s.disconnect();
        sockRef.current = null;
        return;
      }

      setSocket(s);

      s.on("notification.new", (payload: NotificationItemDto) => {
        setUnreadCount((c) => c + 1);
        void (async () => {
          const tauri = await sendDesktopNotificationIfTauri({
            title: payload.title,
            body: payload.body,
          });
          if (!tauri.ok) {
            sendBrowserNotificationIfPermitted({
              title: payload.title,
              body: payload.body,
            });
          }
        })();
      });

      s.on("connect_error", (err: Error) => {
        console.warn("[notifications socket]", err?.message || err);
      });
    })();

    void refreshUnread();

    return () => {
      cancelled = true;
      setSocket(null);
      const s = sockRef.current;
      if (s) {
        s.removeAllListeners();
        s.disconnect();
        sockRef.current = null;
      }
    };
  }, [enabled, refreshUnread]);

  return (
    <NotificationContext.Provider
      value={{ unreadCount, refreshUnread, socket }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
