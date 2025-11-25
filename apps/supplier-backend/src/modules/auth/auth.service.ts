import { Injectable, UnauthorizedException } from "@nestjs/common";
import { LoginDto } from "./dto/login.dto";
import { PrismaService } from "../../core/prisma.service";
import { compare } from "bcryptjs";
import { sign } from "jsonwebtoken";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(loginDto: LoginDto) {
    const { email, managerId, password } = loginDto;

    // Validate that either email or managerId is provided
    if (!email && !managerId) {
      throw new UnauthorizedException("이메일 또는 담당자 ID를 입력하세요");
    }

    return await this.prisma.executeWithRetry(async () => {
      let manager;
      
      // Find manager by email or managerId
      if (email) {
        manager = await this.prisma.supplierManager.findFirst({
          where: { email1: email },
          include: { supplier: true },
        });
      } else if (managerId) {
        manager = await this.prisma.supplierManager.findUnique({
          where: { manager_id: managerId },
          include: { supplier: true },
        });
      }

      if (!manager) {
        throw new UnauthorizedException("이메일 또는 담당자 ID가 올바르지 않습니다");
      }

      // Check if manager is approved
      if (manager.status !== "active" && manager.status !== "approved") {
        throw new UnauthorizedException("승인 대기 중인 계정입니다. 승인 후 로그인해주세요.");
      }

      // Verify password
      const isPasswordValid = await compare(password, manager.password_hash);
      if (!isPasswordValid) {
        throw new UnauthorizedException("비밀번호가 올바르지 않습니다");
      }

      // Generate JWT token
      const secret = process.env.SUPPLIER_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "supplier-secret";
      
      const token = sign(
        {
          sub: manager.id,
          managerId: manager.manager_id,
          email: manager.email1,
          supplierId: manager.supplier_id,
          type: "supplier",
        },
        secret,
        { expiresIn: "12h" }
      );

      return {
        message: "로그인 성공",
        token,
        supplier: {
          id: manager.supplier.id,
          companyName: manager.supplier.company_name,
          managerId: manager.manager_id,
          name: manager.name,
          email: manager.email1,
        },
      };
    });
  }
}

