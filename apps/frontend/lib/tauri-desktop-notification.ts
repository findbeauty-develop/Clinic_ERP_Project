/**
 * Tauri desktop helpers — use dynamic import() only so Next.js does not bundle
 * @tauri-apps/* for the server (avoids "Cannot find module './577.js'" / corrupt .next).
 *
 * Native toasts use only Rust `show_native_notification` (invoke). We do not use
 * @tauri-apps/plugin-notification from remote HTTPS pages: it calls ipc:// URLs that
 * WebKit blocks as mixed/insecure content, so is_permission_granted / sendNotification fail.
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

async function sendNativeViaInvoke(title: string, body: string): Promise<void> {
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke<void>("show_native_notification", { title, body });
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
    await sendNativeViaInvoke(opts.title, opts.body);
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}
