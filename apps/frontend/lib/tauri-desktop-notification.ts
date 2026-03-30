/**
 * Tauri desktop helpers — use dynamic import() only so Next.js does not bundle
 * @tauri-apps/* for the server (avoids "Cannot find module './577.js'" / corrupt .next).
 *
 * - Primary: `invoke("show_native_notification")` (same path as settings test).
 * - If `invoke` fails (e.g. macOS permission denied), the error propagates so the UI can show it.
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

/** Stronger defer after Socket.IO / UI — leave current stack before Tauri IPC. */
function deferForSocketToast(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(() => resolve(), 0);
      });
    });
  });
}

async function sendNativeViaInvokeThenEmit(title: string, body: string): Promise<void> {
  const t = asNotifyText(title, "Jaclit ERP");
  const b = asNotifyText(body, " ");
  await deferForSocketToast();
  const { invoke } = await import("@tauri-apps/api/core");
  try {
    await invoke<void>("show_native_notification", { title: t, body: b });
    console.info("[Jaclit notify] invoke(show_native_notification) ok");
  } catch (invokeErr) {
    console.warn(
      "[Jaclit notify] invoke(show_native_notification) failed — macOS: System Settings → Notifications → Jaclit ERP; or read Rust error below:",
      invokeErr
    );
    throw invokeErr;
  }
}

/**
 * Sends a native notification via Tauri (desktop app only).
 * Uses `invoke` then `emit` fallback; no plugin-notification.
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
    // Same path as socket toasts: invoke → emit fallback (ACL / IPC quirks).
    await sendNativeViaInvokeThenEmit("Jaclit ERP", "데스크톱 알림 테스트");
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
      console.info("[Jaclit notify] skip: not inside Tauri webview");
      return { ok: false, reason: "not-tauri" };
    }
    await sendNativeViaInvokeThenEmit(opts.title, opts.body);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}
