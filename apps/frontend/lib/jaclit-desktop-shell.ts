/**
 * Tauri DMG shell: clinic loads inside an iframe (tauri:// parent). Browsers treat that as a
 * cross-site embedded context, so HttpOnly refresh cookies for api.* are often not stored or sent.
 * We persist refresh in sessionStorage only when this mode is active + login returns refresh_token.
 */

export const DESKTOP_SHELL_QS = "jaclit_desktop_shell";
export const DESKTOP_SHELL_FLAG_KEY = "jaclit_desktop_shell";
export const DESKTOP_SHELL_REFRESH_KEY = "jaclit_desktop_refresh_token";

export function persistDesktopShellFlagFromUrl(): void {
  if (typeof window === "undefined") return;
  try {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get(DESKTOP_SHELL_QS) === "1") {
      sessionStorage.setItem(DESKTOP_SHELL_FLAG_KEY, "1");
    }
  } catch {
    /* private mode */
  }
}

/** True when embedded in the Tauri DMG iframe shell (see apps/desktop/dist/index.html). */
export function isJaclitDesktopShellIframe(): boolean {
  if (typeof window === "undefined" || window.self === window.top) return false;
  try {
    persistDesktopShellFlagFromUrl();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get(DESKTOP_SHELL_QS) === "1") return true;
    return sessionStorage.getItem(DESKTOP_SHELL_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function getDesktopShellRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(DESKTOP_SHELL_REFRESH_KEY);
  } catch {
    return null;
  }
}

export function setDesktopShellRefreshToken(token: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (token) sessionStorage.setItem(DESKTOP_SHELL_REFRESH_KEY, token);
    else sessionStorage.removeItem(DESKTOP_SHELL_REFRESH_KEY);
  } catch {
    /* ignore */
  }
}
