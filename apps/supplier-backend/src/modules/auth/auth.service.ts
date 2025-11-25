import { Injectable, UnauthorizedException } from "@nestjs/common";
import { LoginDto } from "./dto/login.dto";
import { PrismaService } from "../../core/prisma.service";
import { compare } from "bcryptjs";
import { sign } from "jsonwebtoken";

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(loginDto: LoginDto) {
    // TODO: Implement actual supplier authentication
    // For now, return a mock response
    
    const { email, password } = loginDto;

    // Mock authentication - replace with actual supplier lookup
    // const supplier = await this.prisma.supplier.findUnique({
    //   where: { email },
    // });
    // 
    // if (!supplier) {
    //   throw new UnauthorizedException("Invalid credentials");
    // }
    // 
    // const isPasswordValid = await compare(password, supplier.password_hash);
    // if (!isPasswordValid) {
    //   throw new UnauthorizedException("Invalid credentials");
    // }

    // Generate JWT token
    const secret = process.env.SUPPLIER_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || "supplier-secret";
    
    const token = sign(
      {
        sub: "supplier-id", // supplier.id
        email: email,
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
        // Add other supplier fields
      },
    };
  }
}

