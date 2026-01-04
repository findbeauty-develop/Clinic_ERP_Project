import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixSupplierTenantId() {
  // Find the problematic supplier
  const supplierId = "8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c";

  const supplier = await prisma.supplier.findFirst({
    where: { id: supplierId },
    include: {
      managers: {
        select: {
          id: true,
          name: true,
          supplier_tenant_id: true,
        },
      },
    },
  });

  if (!supplier) {
    return;
  }

  supplier.managers.forEach((m: any) => {});

  // Check if tenant_id is a clinic tenant_id (starts with 'clinic_')
  if (supplier.tenant_id?.startsWith("clinic_")) {
    // Generate correct supplier tenant_id
    const businessNumber = supplier.business_number.replace(/[^0-9]/g, "");
    const correctTenantId = `supplier_${businessNumber}_${Date.now()}`;

    // Update Supplier table
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { tenant_id: correctTenantId },
    });

    // Update SupplierManager table
    for (const manager of supplier.managers) {
      await prisma.supplierManager.update({
        where: { id: manager.id },
        data: { supplier_tenant_id: correctTenantId },
      });
    }
  } else {
  }

  await prisma.$disconnect();
}

fixSupplierTenantId().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
