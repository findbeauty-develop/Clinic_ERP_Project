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

  async onModuleInit() {
    await this.connectWithRetry();
  }

  private async connectWithRetry(retryCount = 0): Promise<void> {
    try {
      await this.$connect();
      this.logger.log("Database connection established");
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
        throw new Error("DATABASE_URL is not configured");
      }

      // Check if it's a connection error (P1001)
      const isConnectionError = errorMessage.includes("Can't reach database server") ||
                                errorMessage.includes("P1001") ||
                                errorMessage.includes("connect") ||
                                errorMessage.includes("timeout");

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

      throw error;
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

