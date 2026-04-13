/**
 * ConfigModule `envFilePath` — backend `apps/backend` cwd bilan (`main.ts` dagi `dotenv/config` bilan mos).
 * Dev tartibi [".env.local", ".env"]: birlashtirilganda bir xil kalitda `.env.local` ustun.
 */
export function getNestConfigEnvFilePath(): string | string[] {
  if (process.env.NODE_ENV === "production") {
    return ".env.production";
  }
  return [".env.local", ".env"];
}
