import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 3000; // 3 seconds

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    // Validate DATABASE_URL format (before super call, use console)
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
          console.warn(`Invalid database protocol: ${url.protocol}. Expected postgresql:// or postgres://`);
        }
      } catch (error) {
        if (error instanceof TypeError) {
          // Invalid URL format
          console.warn(`DATABASE_URL format might be incorrect: ${databaseUrl.substring(0, 20)}...`);
        }
      }
    }

    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
      // Connection pool configuration for better reliability
      // These settings help with connection timeouts and retries
    });
  }

  /**
   * Check database connection health
   */
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      this.logger.error(`Database health check failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  private isConnected = false;
  private connectionAttempted = false;
  private lastConnectionCheck = 0;
  private readonly connectionCheckInterval = 5000; // 5 seconds

  async onModuleInit() {
    // Prisma Client automatically manages connections
    // We just try to connect once during startup, but don't fail if it doesn't work
    // Prisma will automatically connect when the first query is made
    this.connectWithRetry()
      .then(() => {
        this.logger.log("Database connection established during startup");
      })
      .catch((error) => {
        this.logger.warn(
          "Database connection failed during startup. Prisma will connect automatically on first query."
        );
        this.isConnected = false;
      });
  }

  /**
   * Ensure database connection is established
   * Prisma Client automatically connects on first query, so this is mostly for logging
   * Only call this if you need to verify connection before a critical operation
   */
  async ensureConnected(): Promise<void> {
    // Prisma Client automatically manages connections
    // We only check if we haven't verified connection recently
    const now = Date.now();
    if (this.isConnected && (now - this.lastConnectionCheck) < this.connectionCheckInterval) {
      return;
    }

    // Silent check - don't log if already connected
    try {
      await this.$queryRaw`SELECT 1`;
      if (!this.isConnected) {
        this.logger.log("Database connection verified");
      }
      this.isConnected = true;
      this.lastConnectionCheck = now;
    } catch (error) {
      // Connection might be down, but Prisma will retry automatically on next query
      this.isConnected = false;
      // Don't throw error - let Prisma handle reconnection
    }
  }

  private async connectWithRetry(retryCount = 0): Promise<void> {
    // Don't attempt if already connected
    if (this.isConnected) {
      return;
    }

    this.connectionAttempted = true;
    
    try {
      // Check if already connected by trying a simple query (silent check)
      try {
        await this.$queryRaw`SELECT 1`;
        this.isConnected = true;
        this.lastConnectionCheck = Date.now();
        // Don't log if already connected to avoid spam
        return;
      } catch (e) {
        // Not connected, proceed with $connect()
      }

      // Only call $connect() if not already connected
      // Prisma's $connect() is idempotent, but we avoid unnecessary calls
      try {
        // Set connection timeout (10 seconds)
        const connectPromise = this.$connect();
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Connection timeout after 10 seconds")), 10000)
        );
        
        await Promise.race([connectPromise, timeoutPromise]);
        this.logger.log("Database connection established");
        this.isConnected = true;
        this.lastConnectionCheck = Date.now();
      } catch (connectError: any) {
        // If $connect() fails with "already connected" error, that's fine
        if (connectError?.message?.includes("already connected") || 
            connectError?.message?.includes("already been established")) {
          this.isConnected = true;
          this.lastConnectionCheck = Date.now();
          return;
        }
        throw connectError;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Failed to connect to database (attempt ${retryCount + 1}/${this.maxRetries}): ${errorMessage}`
      );

      // Check if DATABASE_URL is set
      if (!process.env.DATABASE_URL) {
        this.logger.error(
          "DATABASE_URL is not set in environment variables. Please check your .env file."
        );
        this.isConnected = false;
        throw new Error("DATABASE_URL is not configured");
      }

      // Log DATABASE_URL host for debugging (without password)
      if (process.env.DATABASE_URL) {
        try {
          const url = new URL(process.env.DATABASE_URL);
          this.logger.warn(`Attempting to connect to: ${url.hostname}:${url.port || 5432}`);
        } catch (e) {
          // URL parsing failed, skip logging
        }
      }

      // Check if it's a connection error (P1001)
      const isConnectionError = errorMessage.includes("Can't reach database server") ||
                                errorMessage.includes("P1001") ||
                                errorMessage.includes("connect") ||
                                errorMessage.includes("timeout") ||
                                errorMessage.includes("Connection timeout");

      if (isConnectionError && retryCount < this.maxRetries - 1) {
        const delay = this.retryDelay * (retryCount + 1); // Exponential backoff
        this.logger.warn(`Retrying connection in ${delay / 1000} seconds...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connectWithRetry(retryCount + 1);
      }

      // Final error message with helpful tips
      this.logger.error("=".repeat(60));
      this.logger.error("DATABASE CONNECTION FAILED");
      this.logger.error("=".repeat(60));
      this.logger.error("Please check the following:");
      this.logger.error("1. DATABASE_URL in .env file is correct");
      this.logger.error("2. Format: postgresql://user:password@host:port/database?schema=public");
      this.logger.error("3. Database server is running and accessible");
      this.logger.error("4. Network connectivity to database server");
      this.logger.error("5. Firewall rules allow connection");
      this.logger.error("=".repeat(60));

      if (process.env.DATABASE_URL) {
        const url = new URL(process.env.DATABASE_URL);
        this.logger.error(`Attempting to connect to: ${url.hostname}:${url.port || 5432}`);
      }

      this.isConnected = false;
      
      // Only throw error if this is called from ensureConnected (not during startup)
      // During startup, we want to allow the app to start
      if (retryCount >= this.maxRetries - 1) {
        throw error;
      }
    }
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.logger.log("Database connection closed");
    } catch (error) {
      this.logger.error(
        `Error closing database connection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

