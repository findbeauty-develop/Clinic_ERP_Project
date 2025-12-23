/**
 * Product stock calculation utility
 *
 * @param currentStock - Current stock quantity (e.g., 100 boxes)
 * @param capacityPerProduct - Products per box (e.g., 5 products/box)
 * @param usageCapacity - Products used per usage (e.g., 1 product/usage)
 * @param usedQuantity - Total products used
 * @returns Object with updated stock and usage tracking
 */
export interface ProductCalculationResult {
  updatedStock: number; // Updated currentStock after deduction
  boxesUsed: number; // Number of boxes fully consumed
  remainingProductsInCurrentBox: number; // Remaining products in current box
  totalProductsUsed: number; // Total products used
}

export function calculateProductUsage(
  currentStock: number,
  capacityPerProduct: number,
  usageCapacity: number,
  usedQuantity: number
): ProductCalculationResult {
  // Total products available
  const totalProducts = currentStock * capacityPerProduct;

  // Total products used
  const totalProductsUsed = usedQuantity;

  // Calculate how many boxes are fully consumed
  const boxesUsed = Math.floor(totalProductsUsed / capacityPerProduct);

  // Remaining products in the current box
  const remainingProductsInCurrentBox = totalProductsUsed % capacityPerProduct;

  // Updated stock (deduct fully consumed boxes)
  const updatedStock = Math.max(0, currentStock - boxesUsed);

  return {
    updatedStock,
    boxesUsed,
    remainingProductsInCurrentBox,
    totalProductsUsed,
  };
}

/**
 * Calculate how many boxes to deduct based on cumulative usage
 * This tracks usage across multiple outbound operations
 */
export function calculateBoxDeduction(
  currentStock: number,
  capacityPerProduct: number,
  cumulativeUsage: number // Cumulative products used across all outbound operations
): {
  boxesToDeduct: number;
  remainingUsage: number; // Usage that doesn't complete a full box
} {
  const boxesToDeduct = Math.floor(cumulativeUsage / capacityPerProduct);
  const remainingUsage = cumulativeUsage % capacityPerProduct;

  return {
    boxesToDeduct: Math.min(boxesToDeduct, currentStock), // Can't deduct more than available
    remainingUsage,
  };
}
