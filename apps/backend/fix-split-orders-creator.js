/**
 * Migration Script: Fix Split Orders Creator Info
 *
 * This script updates split orders (ending in -R or -B) to have
 * the correct created_by, clinic_manager_name, and order_date
 * from their original orders.
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixSplitOrders() {
  try {
    console.log("🔍 Finding split orders...\n");

    // Find all split orders (ending in -R or -B)
    const allOrders = await prisma.order.findMany({
      where: {
        order_no: {
          contains: "-",
        },
      },
      select: {
        id: true,
        order_no: true,
        created_by: true,
        clinic_manager_name: true,
        order_date: true,
        tenant_id: true,
      },
    });

    // Filter split orders (ending with -R or -B)
    const splitOrders = allOrders.filter((order) =>
      order.order_no.match(/-[RB]$/)
    );

    console.log(`Found ${splitOrders.length} split orders\n`);

    let updatedCount = 0;
    let skippedCount = 0;

    for (const splitOrder of splitOrders) {
      // Extract original order number (remove -R or -B)
      const originalOrderNo = splitOrder.order_no.replace(/-[RB]$/, "");

      // Find original order
      const originalOrder = await prisma.order.findFirst({
        where: {
          order_no: originalOrderNo,
          tenant_id: splitOrder.tenant_id,
        },
        select: {
          created_by: true,
          clinic_manager_name: true,
          order_date: true,
        },
      });

      if (!originalOrder) {
        console.log(`⚠️  Original order not found for ${splitOrder.order_no}`);
        skippedCount++;
        continue;
      }

      // Check if split order needs update
      const needsUpdate =
        splitOrder.created_by !== originalOrder.created_by ||
        splitOrder.clinic_manager_name !== originalOrder.clinic_manager_name ||
        !splitOrder.order_date;

      if (!needsUpdate) {
        console.log(`✓  ${splitOrder.order_no} - Already correct`);
        skippedCount++;
        continue;
      }

      // Update split order
      await prisma.order.update({
        where: { id: splitOrder.id },
        data: {
          created_by: originalOrder.created_by,
          clinic_manager_name: originalOrder.clinic_manager_name,
          order_date: originalOrder.order_date,
        },
      });

      console.log(
        `✅ ${splitOrder.order_no} - Updated creator info from ${originalOrderNo}`
      );
      updatedCount++;
    }

    console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`📊 SUMMARY:`);
    console.log(`   Total split orders: ${splitOrders.length}`);
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

    console.log("✅ Migration completed successfully!\n");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
fixSplitOrders()
  .then(() => {
    console.log("✅ Script finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("❌ Script failed:", error);
    process.exit(1);
  });
