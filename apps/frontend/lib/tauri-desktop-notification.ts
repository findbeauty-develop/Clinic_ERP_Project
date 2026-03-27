/**
 * Tauri desktop helpers — use dynamic import() only so Next.js does not bundle
 * @tauri-apps/* for the server (avoids "Cannot find module './577.js'" / corrupt .next).
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

/**
 * Sends a native notification via Tauri (desktop app only).
 * CSP must allow connect-src: ipc: http://ipc.localhost for remote HTTPS pages.
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
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const p = await requestPermission();
      granted = p === "granted";
    }
    if (!granted) {
      return { ok: false, reason: "denied" };
    }
    sendNotification({
      title: "Jaclit ERP",
      body: "데스크톱 알림 테스트",
    });
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
    const { isPermissionGranted, requestPermission, sendNotification } =
      await import("@tauri-apps/plugin-notification");

    let granted = await isPermissionGranted();
    if (!granted) {
      const p = await requestPermission();
      granted = p === "granted";
    }
    if (!granted) {
      return { ok: false, reason: "denied" };
    }
    sendNotification({ title: opts.title, body: opts.body });
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "error",
    };
  }
}
