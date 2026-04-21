import { GetReturnHistoryDto } from "../dto/get-return-history.dto";
import { ReturnHistoryFilter } from "../types/return.types";

export function toReturnHistoryFilter(
  query: GetReturnHistoryDto
): ReturnHistoryFilter {
  return {
    ...(query.productId && { productId: query.productId }),
    ...(query.startDate && { startDate: new Date(query.startDate) }),
    ...(query.endDate && { endDate: new Date(query.endDate) }),
    ...(query.page !== undefined && { page: query.page }),
    ...(query.limit !== undefined && { limit: query.limit }),
  };
}
