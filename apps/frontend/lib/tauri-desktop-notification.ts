/**
 * Tauri desktop helpers — use dynamic import() only so Next.js does not bundle
 * @tauri-apps/* for the server (avoids "Cannot find module './577.js'" / corrupt .next).
 *
 * - Primary: `invoke("show_native_notification")` (same path as settings test).
 * - DMG shell (`apps/desktop/dist/index.html`) loads the site in an **iframe** so the top document
 *   stays on the Tauri asset origin; macOS WebKit otherwise blocks `ipc://` from HTTPS (mixed content).
 *   In that case we proxy `invoke` via `postMessage` to the parent frame.
 * - If `invoke` fails (e.g. macOS permission denied), the error propagates so the UI can show it.
 * We avoid @tauri-apps/plugin-notification from remote pages (ipc:// mixed-content blocks).
 */

import {
  isJaclitDesktopShellIframe,
  persistDesktopShellFlagFromUrl,
} from "./jaclit-desktop-shell";

function isAllowedTauriParentOrigin(origin: string): boolean {
  const o = origin.replace(/\/$/, "");
  return (
    o === "tauri://localhost" ||
    /^https?:\/\/tauri\.localhost$/i.test(o)
  );
}

/**
 * Accept parent replies even when WebKit reports an odd `event.origin` for the Tauri shell
 * (e.g. empty, "null", or tauri: variants). The pending invoke id is unguessable, so matching
 * `e.source === window.parent` is sufficient for our one-level iframe.
 */
function isTrustedParentReply(e: MessageEvent): boolean {
  if (typeof window === "undefined" || window.self === window.top) return false;
  try {
    if (e.source !== window.parent) return false;
  } catch {
    return false;
  }
  const o = e.origin || "";
  if (isAllowedTauriParentOrigin(o)) return true;
  if (o === "null" || o === "") return true;
  if (/^tauri:/i.test(o)) return true;
  return false;
}

function invokeViaParentTauriBridge<T>(cmd: string, payload: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random()}`;

    const timeoutMs = 30000;
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("Tauri parent bridge timeout"));
    }, timeoutMs);

    function onMessage(e: MessageEvent) {
      if (!isTrustedParentReply(e)) return;
      const d = e.data as {
        v?: number;
        t?: string;
        id?: string;
        ok?: boolean;
        data?: unknown;
        err?: string;
      };
      if (!d || d.v !== 1 || d.t !== "invoke-result" || d.id !== id) return;
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timer);
      if (d.ok) resolve(d.data as T);
      else reject(new Error(d.err || "invoke failed"));
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ v: 1, t: "invoke", id, cmd, payload }, "*");
  });
}

export async function detectTauriDesktop(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  persistDesktopShellFlagFromUrl();
  if (isJaclitDesktopShellIframe()) return true;
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
  try {
    if (isJaclitDesktopShellIframe()) {
      await invokeViaParentTauriBridge<void>("show_native_notification", { title: t, body: b });
      console.info("[Jaclit notify] parent-bridge invoke(show_native_notification) ok");
      return;
    }
    const { invoke } = await import("@tauri-apps/api/core");
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
    persistDesktopShellFlagFromUrl();
    if (!isJaclitDesktopShellIframe()) {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) {
        return { ok: false, reason: "not-tauri" };
      }
    }
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
    persistDesktopShellFlagFromUrl();
    if (!isJaclitDesktopShellIframe()) {
      const { isTauri } = await import("@tauri-apps/api/core");
      if (!isTauri()) {
        console.info("[Jaclit notify] skip: not inside Tauri webview");
        return { ok: false, reason: "not-tauri" };
      }
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
