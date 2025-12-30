import { Injectable, OnModuleInit, Logger, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "../../node_modules/.prisma/client-backend";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  [x: string]: any;
  private readonly logger = new Logger(PrismaService.name);
  private readonly maxRetries = 5;
  private readonly retryDelay = 3000; // 3 seconds
  $transaction: any;

  constructor() {
    let databaseUrl = process.env.DATABASE_URL;
    
    // Validate DATABASE_URL format and ensure pgbouncer parameter for connection poolers
    if (databaseUrl) {
      try {
        const url = new URL(databaseUrl);
        if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") {
          console.warn(`Invalid database protocol: ${url.protocol}. Expected postgresql:// or postgres://`);
        }
        
        // Check if using a connection pooler (Supabase, Neon, etc.)
        const isPooler = 
          url.hostname.includes("pooler.supabase.com") ||
          url.hostname.includes("neon.tech") ||
          url.port === "6543" || // pgbouncer default port
          url.searchParams.has("pgbouncer");
        
        // Add pgbouncer=true parameter if using a pooler and it's not already there
        // This disables prepared statements which are not supported by pgbouncer
        if (isPooler && !url.searchParams.has("pgbouncer")) {
          url.searchParams.set("pgbouncer", "true");
          databaseUrl = url.toString();
          console.log("✅ Added ?pgbouncer=true to DATABASE_URL to disable prepared statements for connection pooling");
        }
        
        // Add connection pooling parameters for better performance
        if (isPooler) {
          if (!url.searchParams.has("connection_limit")) {
            url.searchParams.set("connection_limit", "10");
          }
          if (!url.searchParams.has("pool_timeout")) {
            url.searchParams.set("pool_timeout", "30");
          }
          if (!url.searchParams.has("connect_timeout")) {
            url.searchParams.set("connect_timeout", "10");
          }
          databaseUrl = url.toString();
          console.log("✅ Added connection pooling parameters (connection_limit=10, pool_timeout=30, connect_timeout=10)");
        }
        
        // Check if using port 5432 and suggest port 6543 for pgbouncer
        if (url.port === "5432" && url.hostname.includes("pooler.supabase.com")) {
          console.warn(
            "⚠️  Using port 5432 with Supabase pooler. Consider using port 6543 with ?pgbouncer=true for better connection pooling."
          );
        }
      } catch (error) {
        if (error instanceof TypeError) {
          // Invalid URL format
          console.warn(`DATABASE_URL format might be incorrect: ${databaseUrl?.substring(0, 20)}...`);
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
      // Connection pool configuration
      // Prisma uses connection pooling automatically
      // For Supabase, use port 6543 with ?pgbouncer=true in DATABASE_URL
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
    // Don't attempt connection during startup - let Prisma connect on first query
    // This prevents blocking startup and connection error spam
    this.logger.log("PrismaService initialized. Database will connect automatically on first query.");
    this.isConnected = false; // Will be set to true when first query succeeds

    // Enable query logging for performance diagnostics
    if (process.env.ENABLE_PRISMA_QUERY_LOG === "true") {
      try {
        (this as any).$on("query", (e: any) => {
          const query = e.query || "";
          const duration = e.duration || 0;
          const truncatedQuery = query.length > 100 ? query.substring(0, 100) + "..." : query;
          console.log(`[PRISMA QUERY] ${duration}ms - ${truncatedQuery}`);
        });
        this.logger.log("✅ Prisma query logging enabled. Set ENABLE_PRISMA_QUERY_LOG=true to enable.");
      } catch (error) {
        this.logger.warn("Failed to enable Prisma query logging:", error);
      }
    }
  }

  /**
   * Ensure database connection is established
   * Prisma Client automatically connects on first query
   * This method is now a no-op to prevent connection spam
   */
  async ensureConnected(): Promise<void> {
    // Prisma Client automatically manages connections
    // Don't do anything here - let Prisma handle it
    // This prevents $queryRaw spam and connection loops
    return;
  }

  /**
   * Execute a database operation with automatic retry on connection errors
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    retries = 2, // Increased retries for connection issues
    delay = 2000 // Initial delay
  ): Promise<T> {
    let lastError: Error | unknown;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Don't call ensureConnected here - let Prisma handle it automatically
        // This prevents unnecessary connection attempts
        return await operation();
      } catch (error: any) {
        lastError = error;
        const errorMessage = error?.message || String(error);
        
        // Check if it's a connection error or prepared statement error (pgbouncer)
        const isConnectionError = 
          errorMessage.includes("Can't reach database server") ||
          errorMessage.includes("P1001") ||
          errorMessage.includes("connect") ||
          errorMessage.includes("timeout") ||
          errorMessage.includes("Connection timeout") ||
          errorMessage.includes("ECONNREFUSED") ||
          errorMessage.includes("ENOTFOUND") ||
          errorMessage.includes("prepared statement") ||
          errorMessage.includes("does not exist") ||
          error?.code === "P1001" ||
          error?.code === "ECONNREFUSED" ||
          error?.code === "26000"; // PostgreSQL error code for prepared statement errors

        if (isConnectionError && attempt < retries) {
          this.logger.warn(
            `Database connection error (attempt ${attempt + 1}/${retries + 1}), retrying in ${delay / 1000}s...`
          );
          this.isConnected = false; // Mark as disconnected
          
          // For prepared statement errors, disconnect and reconnect to get a fresh connection
          if (errorMessage.includes("prepared statement") || error?.code === "26000") {
            try {
              await this.$disconnect();
              // Small delay before reconnecting
              await new Promise(resolve => setTimeout(resolve, 500));
              await this.$connect();
            } catch (reconnectError) {
              // Ignore reconnect errors, will retry
              this.logger.debug("Reconnect attempt failed, will retry operation");
            }
          }
          
          // Exponential backoff with jitter
          await new Promise(resolve => setTimeout(resolve, delay));
          delay = Math.min(delay * 1.5, 10000); // Exponential backoff, max 10 seconds
          continue;
        }
        
        // If not a connection error or max retries reached, throw
        if (!isConnectionError) {
          throw error;
        }
      }
    }
    
    // If we get here, all retries failed
    this.logger.error(
      `Database operation failed after ${retries + 1} attempts. Last error: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
    throw lastError;
  }

  private async connectWithRetry(retryCount = 0, maxRetries?: number): Promise<void> {
    // Don't attempt if already connected
    if (this.isConnected) {
      return;
    }

    const maxAttempts = maxRetries ?? this.maxRetries;
    
    // Prevent infinite retries
    if (retryCount >= maxAttempts) {
      this.logger.error(`Max retry attempts (${maxAttempts}) reached. Stopping connection attempts.`);
      throw new Error(`Failed to connect to database after ${maxAttempts} attempts`);
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

      if (isConnectionError && retryCount < maxAttempts - 1) {
        const delay = Math.min(this.retryDelay * (retryCount + 1), 10000); // Max 10 seconds delay
        this.logger.warn(`Retrying connection in ${delay / 1000} seconds... (attempt ${retryCount + 1}/${maxAttempts})`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return this.connectWithRetry(retryCount + 1, maxAttempts);
      }

      // Final error message with helpful tips
      this.logger.error("=".repeat(60));
      this.logger.error("DATABASE CONNECTION FAILED");
      this.logger.error("=".repeat(60));
      this.logger.error("Please check the following:");
      this.logger.error("1. DATABASE_URL in .env file is correct");
      this.logger.error("2. Format: postgresql://user:password@host:port/database?schema=public");
      this.logger.error("3. For Supabase, try using port 6543 with pgbouncer:");
      this.logger.error("   postgresql://user:password@host:6543/database?pgbouncer=true");
      this.logger.error("4. Database server is running and accessible");
      this.logger.error("5. Network connectivity to database server");
      this.logger.error("6. Firewall rules allow connection");
      this.logger.error("=".repeat(60));

      if (process.env.DATABASE_URL) {
        try {
          const url = new URL(process.env.DATABASE_URL);
          this.logger.error(`Attempting to connect to: ${url.hostname}:${url.port || 5432}`);
          if (url.port === "5432" && url.hostname.includes("supabase")) {
            this.logger.error("💡 Tip: Try changing port to 6543 and add ?pgbouncer=true");
          }
        } catch (e) {
          // URL parsing failed
        }
      }

      this.isConnected = false;
      
      // Only throw error if max retries reached
      if (retryCount >= maxAttempts - 1) {
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

