import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyTables() {
  try {
    console.log("Checking if Supplier tables exist...\n");

    // Try to query each table
    const supplierCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Supplier"`;
    console.log("✅ Supplier table exists");

    const managerCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierManager"`;
    console.log("✅ SupplierManager table exists");

    const regionTagCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierRegionTag"`;
    console.log("✅ SupplierRegionTag table exists");

    const productTagCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierProductTag"`;
    console.log("✅ SupplierProductTag table exists");

    console.log("\n✅ All tables verified successfully!");
    console.log("\nYou can now test the registration flow:");
    console.log("1. POST /supplier/manager/register-complete");
    console.log("2. POST /supplier/login");
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.message?.includes("does not exist")) {
      console.log("\n⚠️  Tables not found. Please run the create-tables script first.");
    }
  } finally {
    await prisma.$disconnect();
  }
}

verifyTables();

