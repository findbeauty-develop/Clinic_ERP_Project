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

    // TODO: Implement actual supplier authentication
    // For now, return a mock response
    
    // Mock authentication - replace with actual supplier lookup
    // if (email) {
    //   const supplier = await this.prisma.supplier.findUnique({
    //     where: { email },
    //   });
    //   
    //   if (!supplier) {
    //     throw new UnauthorizedException("Invalid credentials");
    //   }
    //   
    //   const isPasswordValid = await compare(password, supplier.password_hash);
    //   if (!isPasswordValid) {
    //     throw new UnauthorizedException("Invalid credentials");
    //   }
    // } else if (managerId) {
    //   const supplier = await this.prisma.supplierManager.findFirst({
    //     where: { manager_id: managerId },
    //     include: { supplier: true },
    //   });
    //   
    //   if (!supplier) {
    //     throw new UnauthorizedException("Invalid credentials");
    //   }
    //   
    //   const isPasswordValid = await compare(password, supplier.password_hash);
    //   if (!isPasswordValid) {
    //     throw new UnauthorizedException("Invalid credentials");
    //   }
    // }

    // Generate JWT token
    const secret = process.env.SUPPLIER_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "supplier-secret";
    
    const identifier = email || managerId;
    
    const token = sign(
      {
        sub: "supplier-id", // supplier.id
        email: email || undefined,
        managerId: managerId || undefined,
        type: "supplier",
      },
      secret,
      { expiresIn: "12h" }
    );

    return {
      message: "Login successful",
      token,
      supplier: {
        email: email,
        managerId: managerId,
        // Add other supplier fields
      },
    };
  }
}

