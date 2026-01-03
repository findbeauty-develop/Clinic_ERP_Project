import { Module } from "@nestjs/common";
import { SupabaseService } from "../../common/supabase.service";
import { MemberModule } from "../member/member.module";
import { OrderReturnController } from "./order-return.controller";
import { OrderReturnService } from "./order-return.service";

@Module({
  imports: [MemberModule], // Import MemberModule to use MessageService
  controllers: [OrderReturnController],
  providers: [OrderReturnService, SupabaseService],
  exports: [OrderReturnService],
})
export class OrderReturnModule {}
