/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production build'da console.log'larni olib tashlash
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production"
        ? {
            exclude: ["error", "warn"], // error va warn'larni saqlash (muhim loglar)
          }
        : false,
  },
  /**
   * Tauri / local dev: connect-src needs ipc:, ws:, and localhost API ports.
   */
  async headers() {
    /** Dev: frontend boshqa portda, API/uploads — localhost:3000 va hokazo (http, https emas). */
    const devLocalHosts =
      process.env.NODE_ENV === "development"
        ? " http://localhost:3000 http://127.0.0.1:3000 http://localhost:3001 http://127.0.0.1:3001 http://localhost:3002 http://127.0.0.1:3002"
        : "";
    // Tauri DMG shell embeds this site in an iframe (tauri:// on macOS, http(s)://tauri.localhost on Win).
    // Nginx must NOT send X-Frame-Options: SAMEORIGIN for clinic — that header blocks embedding regardless.
    const frameAncestors = [
      "'self'",
      "http://tauri.localhost",
      "https://tauri.localhost",
      "tauri://localhost",
    ].join(" ");
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      `img-src 'self' data: https: blob:${devLocalHosts}`,
      "font-src 'self' data: https:",
      "frame-src 'self' https:",
      `frame-ancestors ${frameAncestors}`,
      `connect-src 'self' ipc: http://ipc.localhost https: wss: ws: data: blob:${devLocalHosts}`,
    ].join("; ");
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

module.exports = nextConfig;
