import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
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
  
  constructor(private readonly configService: ConfigService) {
    // ✅ ConfigService orqali DATABASE_URL ni olish (env file'dan yuklanadi, priority: .env.local > .env > process.env)
    // Note: configService parameter is available before super() call
    // ❌ Fallback'ni olib tashlash - faqat ConfigService'dan olish (env file priority)
    const databaseUrl = configService.get<string>('DATABASE_URL');
    const nodeEnv = configService.get<string>('NODE_ENV') || process.env.NODE_ENV || 'development';
    
    // ✅ DATABASE_URL tekshirish - agar yo'q bo'lsa, error
    if (!databaseUrl) {
      const errorMsg = '❌ DATABASE_URL is not set in .env.local or .env file! Please check your environment configuration.';
      console.error(errorMsg);
      throw new Error(errorMsg);
    }

    // ✅ super() ni birinchi chaqirish (TypeScript requirement)
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: nodeEnv === "development" ? ["error", "warn"] : ["error"],
    });
    
    // ✅ Logging - super() chaqirilgandan keyin (this.logger ishlatish mumkin)
   
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

