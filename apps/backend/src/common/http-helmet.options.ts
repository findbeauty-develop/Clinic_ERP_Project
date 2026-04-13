import type { HelmetOptions } from "helmet";

/**
 * Helmet for JSON API + dev-only Swagger (/docs). CSP kept aligned with prior main.ts
 * (media-src / child-src omitted — they followed default-src 'self' already).
 */
export const httpHelmetOptions: HelmetOptions = {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:3003",
      ],
      fontSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.jaclit.com"],
      frameSrc: ["'self'"],
      objectSrc: ["'none'"],
      workerSrc: ["'self'"],
      formAction: ["'self'"],
      baseUri: ["'self'"],
      frameAncestors: ["'none'"],
    },
  },
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  xFrameOptions: { action: "deny" },
  xContentTypeOptions: true,
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: false,
  originAgentCluster: true,
  permittedCrossDomainPolicies: false,
  dnsPrefetchControl: true,
};
