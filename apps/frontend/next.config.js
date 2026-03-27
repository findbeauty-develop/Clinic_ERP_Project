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
   * Tauri desktop WebView: @tauri-apps/plugin-notification IPC fetch uses
   * ipc: and http://ipc.localhost — without these in connect-src, the console shows
   * "Fetch API cannot load ipc://... due to access control checks".
   */
  async headers() {
    // next dev: API is often http://localhost:3000 (not covered by connect-src https:)
    const devLocalConnect =
      process.env.NODE_ENV === "development"
        ? " http://localhost:3000 http://127.0.0.1:3000 http://localhost:3002 http://127.0.0.1:3002"
        : "";
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'self' 'unsafe-inline' https:",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: https:",
      "frame-src 'self' https:",
      `connect-src 'self' ipc: http://ipc.localhost https: wss: ws: data: blob:${devLocalConnect}`,
    ].join("; ");
    return [{ source: "/:path*", headers: [{ key: "Content-Security-Policy", value: csp }] }];
  },
};

module.exports = nextConfig;
