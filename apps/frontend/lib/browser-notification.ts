/**
 * Web Notifications API (Safari, Chrome, etc.) — same pattern as
 * /settings/notifications browser test. Only runs when permission is "granted".
 */

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Shows OS/browser notification if user already granted permission (no prompt). */
export function sendBrowserNotificationIfPermitted(opts: {
  title: string;
  body: string;
}): void {
  if (!isBrowserNotificationSupported()) return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(opts.title, {
      body: opts.body,
      icon: "/favicon.ico",
    });
  } catch {
    /* ignore */
  }
}
