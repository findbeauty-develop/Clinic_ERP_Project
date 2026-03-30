/**
 * Tauri desktop helpers — use dynamic import() only so Next.js does not bundle
 * @tauri-apps/* for the server (avoids "Cannot find module './577.js'" / corrupt .next).
 *
 * - Settings test: `invoke("show_native_notification")`.
 * - Socket / order toasts: `emit("native-notification")` → Rust `listen` (often more reliable
 *   after WebSocket callbacks than `invoke` on remote HTTPS WebViews).
 * We avoid @tauri-apps/plugin-notification from remote pages (ipc:// mixed-content blocks).
 */

export async function detectTauriDesktop(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    return isTauri();
  } catch {
    return false;
  }
}

function asNotifyText(value: unknown, fallback: string): string {
  if (value == null) return fallback;
  const s = typeof value === "string" ? value : String(value);
  const t = s.trim();
  return t === "" ? fallback : t;
}

/** Next macrotask — defer before `invoke` from UI clicks. */
function deferMacrotask(): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(), 0);
  });
}

/** Stronger defer after Socket.IO — leave WebSocket stack before Tauri IPC. */
function deferForSocketToast(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => resolve(), 0);
      });
    });
  });
}

async function sendNativeViaInvoke(title: string, body: string): Promise<void> {
  await deferMacrotask();
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("show_native_notification", {
    title: asNotifyText(title, "Jaclit ERP"),
    body: asNotifyText(body, " "),
  });
}

async function sendNativeViaEmitThenInvoke(title: string, body: string): Promise<void> {
  const t = asNotifyText(title, "Jaclit ERP");
  const b = asNotifyText(body, " ");
  await deferForSocketToast();
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit("native-notification", { title: t, body: b });
  } catch {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke<void>("show_native_notification", { title: t, body: b });
  }
}

/**
 * Sends a native notification via Tauri (desktop app only).
 * Uses Rust notify-rust only (`invoke` → postMessage IPC); no plugin-notification.
 */
export async function sendTauriTestNotificationFromWeb(): Promise<{
  ok: boolean;
  reason?: string;
}> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "server" };
  }
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (!isTauri()) {
      return { ok: false, reason: "not-tauri" };
    }
    await sendNativeViaInvoke("Jaclit ERP", "데스크톱 알림 테스트");
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}

/** Native OS notification when running inside Tauri (e.g. order supplier events). */
export async function sendDesktopNotificationIfTauri(opts: {
  title: string;
  body: string;
}): Promise<{ ok: boolean; reason?: string }> {
  if (typeof window === "undefined") {
    return { ok: false, reason: "server" };
  }
  try {
    const { isTauri } = await import("@tauri-apps/api/core");
    if (!isTauri()) {
      return { ok: false, reason: "not-tauri" };
    }
    await sendNativeViaEmitThenInvoke(opts.title, opts.body);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}
