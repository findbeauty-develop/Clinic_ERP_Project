import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function verifyTables() {
  try {
    

    // Try to query each table
    const supplierCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "Supplier"`;
    

    const managerCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierManager"`;
    

    const regionTagCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierRegionTag"`;
   

    const productTagCount = await prisma.$queryRaw`SELECT COUNT(*) as count FROM "SupplierProductTag"`;
   

   
  } catch (error: any) {
    console.error("❌ Error:", error.message);
    if (error.message?.includes("does not exist")) {
      
    }
  } finally {
    await prisma.$disconnect();
  }
}

verifyTables();

