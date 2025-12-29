import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function fixSupplierTenantId() {
  console.log('🔍 Checking for suppliers with incorrect tenant_id...\n');

  // Find the problematic supplier
  const supplierId = '8387a4ca-ea59-4e02-a6dd-2ffd5faa1b5c';
  
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
    console.log('❌ Supplier not found');
    return;
  }

  console.log('Current Supplier Data:');
  console.log(`  ID: ${supplier.id}`);
  console.log(`  Company Name: ${supplier.company_name}`);
  console.log(`  Business Number: ${supplier.business_number}`);
  console.log(`  Current tenant_id: ${supplier.tenant_id}`);
  console.log(`  Managers (${supplier.managers.length}):`);
  supplier.managers.forEach((m: any) => {
    console.log(`    - ${m.name} (${m.id})`);
    console.log(`      supplier_tenant_id: ${m.supplier_tenant_id}`);
  });

  // Check if tenant_id is a clinic tenant_id (starts with 'clinic_')
  if (supplier.tenant_id?.startsWith('clinic_')) {
    console.log('\n⚠️  WARNING: Supplier tenant_id is a clinic tenant_id. This is incorrect!');
    
    // Generate correct supplier tenant_id
    const businessNumber = supplier.business_number.replace(/[^0-9]/g, '');
    const correctTenantId = `supplier_${businessNumber}_${Date.now()}`;
    
    console.log(`\n✅ Correct tenant_id should be: ${correctTenantId}`);
    console.log('\n🔧 Fixing...');

    // Update Supplier table
    await prisma.supplier.update({
      where: { id: supplierId },
      data: { tenant_id: correctTenantId },
    });
    console.log('  ✓ Updated Supplier.tenant_id');

    // Update SupplierManager table
    for (const manager of supplier.managers) {
      await prisma.supplierManager.update({
        where: { id: manager.id },
        data: { supplier_tenant_id: correctTenantId },
      });
      console.log(`  ✓ Updated SupplierManager.supplier_tenant_id for ${manager.name}`);
    }

    console.log('\n✅ Fix completed successfully!');
    console.log('\n📝 Summary:');
    console.log(`  Old tenant_id: ${supplier.tenant_id}`);
    console.log(`  New tenant_id: ${correctTenantId}`);
    console.log(`  Updated ${supplier.managers.length} manager(s)`);
  } else {
    console.log('\n✅ Supplier tenant_id is correct (no fix needed)');
  }

  await prisma.$disconnect();
}

fixSupplierTenantId().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});

