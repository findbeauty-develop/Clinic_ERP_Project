import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { PrismaClient } from "../../node_modules/.prisma/client-supplier";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  [x: string]: any;
  private readonly logger = new Logger(PrismaService.name);
  private isConnected = false;
  private connectionAttempted = false;
  
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;
    
    // Validate DATABASE_URL format (before super call, use console)
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
          console.warn(`Invalid database protocol: ${url.protocol}. Expected postgresql:// or postgres://`);
        }
        
        // Check if using port 5432 and suggest port 6543 for pgbouncer
        if (url.port === "5432" && url.hostname.includes("pooler.supabase.com")) {
          console.warn(
            "⚠️  Using port 5432 with Supabase pooler. Consider using port 6543 with ?pgbouncer=true&connection_limit=5&pool_timeout=30 for better connection pooling."
          );
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
  
  async onModuleInit() {
    await this.connectWithRetry();
  }

  async onModuleDestroy() {
    try {
      await this.$disconnect();
      this.isConnected = false;
    } catch (error) {
      this.logger.error("Error disconnecting from database:", error);
    }
  }

  private async connectWithRetry(retryCount = 0, maxRetries = 5): Promise<void> {
    if (this.isConnected) {
      return;
    }

    if (retryCount >= maxRetries) {
      this.logger.error(`Max retry attempts (${maxRetries}) reached. Stopping connection attempts.`);
      throw new Error(`Failed to connect to database after ${maxRetries} attempts`);
    }

    this.connectionAttempted = true;
    
    try {
      // Check if already connected
      try {
        await this.$queryRaw`SELECT 1`;
        this.isConnected = true;
        return;
      } catch (e) {
        // Not connected, proceed with $connect()
      }

      // Set connection timeout (10 seconds)
      const connectPromise = this.$connect();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Connection timeout after 10 seconds")), 10000)
      );
      
      await Promise.race([connectPromise, timeoutPromise]);
      this.logger.log("Database connection established");
      this.isConnected = true;
    } catch (error: any) {
      // If $connect() fails with "already connected" error, that's fine
      if (error?.message?.includes("already connected") || 
          error?.message?.includes("already been established")) {
        this.isConnected = true;
        return;
      }

      this.logger.warn(`Connection attempt ${retryCount + 1}/${maxRetries} failed: ${error?.message || error}`);
      
      if (retryCount < maxRetries - 1) {
        const delay = Math.min(3000 * (retryCount + 1), 10000); // Max 10 seconds
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connectWithRetry(retryCount + 1, maxRetries);
      }
      
      throw error;
    }
  }

  /**
   * Retry logic for database operations with connection recovery
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
    let lastError: Error;
    for (let i = 0; i < maxRetries; i++) {
      try {
        // Check connection before operation
        if (!this.isConnected) {
          await this.connectWithRetry();
        }
        return await operation();
      } catch (error: any) {
        lastError = error as Error;
        
        // If connection is closed, try to reconnect
        if (error?.message?.includes("Closed") || 
            error?.message?.includes("connection") ||
            error?.code === "P1001") {
          this.isConnected = false;
          if (i < maxRetries - 1) {
            this.logger.warn(`Connection error detected, attempting to reconnect... (${i + 1}/${maxRetries})`);
            try {
              await this.connectWithRetry();
            } catch (reconnectError) {
              this.logger.error("Failed to reconnect:", reconnectError);
            }
          }
        }
        
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    throw lastError!;
  }
}

