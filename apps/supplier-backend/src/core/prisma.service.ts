import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "../../node_modules/.prisma/client-supplier";

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  [x: string]: any;
  
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      // Supabase connection pooling optimization
      log: ['error', 'warn'],
    });
  }
  
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Retry logic for database operations
   */
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
    let lastError: Error;
    for (let i = 0; i < maxRetries; i++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (i < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, delay * (i + 1)));
        }
      }
    }
    throw lastError!;
  }
}

