import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function createTables() {
  try {
    const migrationPath = path.join(__dirname, "../prisma/migrations/0_init/migration.sql");
    const sql = fs.readFileSync(migrationPath, "utf-8");
    
    // Execute the entire SQL file as one transaction
    
    
    try {
      await prisma.$executeRawUnsafe(sql);
      
    } catch (error: any) {
      // If tables already exist, that's okay
      if (error.message?.includes("already exists") || error.code === "42P07" || error.code === "23505") {
        
      } else {
        console.error("✗ Error:", error.message);
        // Try executing statement by statement as fallback
       
        await executeStatementsIndividually(sql);
      }
    }
  } catch (error) {
    console.error("❌ Error creating tables:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

async function executeStatementsIndividually(sql: string) {
  // Remove comments and split by semicolons, but preserve DO blocks
  const lines = sql.split("\n");
  const statements: string[] = [];
  let currentStatement = "";
  let inDoBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("--")) continue;

    currentStatement += line + "\n";

    if (trimmed.startsWith("DO $$")) {
      inDoBlock = true;
    }

    if (trimmed.endsWith("$$;") && inDoBlock) {
      statements.push(currentStatement.trim());
      currentStatement = "";
      inDoBlock = false;
    } else if (trimmed.endsWith(";") && !inDoBlock) {
      statements.push(currentStatement.trim());
      currentStatement = "";
    }
  }

  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  for (const statement of statements) {
    if (statement.trim()) {
      try {
        await prisma.$executeRawUnsafe(statement);
        
      } catch (error: any) {
        if (
          error.message?.includes("already exists") ||
          error.code === "42P07" ||
          error.code === "23505" ||
          error.message?.includes("duplicate")
        ) {
          
        } else {
          console.error("✗ Error:", error.message?.substring(0, 100));
          // Don't throw, continue with other statements
        }
      }
    }
  }
}

createTables();

