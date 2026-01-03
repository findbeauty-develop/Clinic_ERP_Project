import { Module } from "@nestjs/common";
import { RejectedOrderService } from "./rejected-order.service";
import { RejectedOrderController } from "./rejected-order.controller";

@Module({
  controllers: [RejectedOrderController],
  providers: [RejectedOrderService],
  exports: [RejectedOrderService],
})
export class RejectedOrderModule {}
