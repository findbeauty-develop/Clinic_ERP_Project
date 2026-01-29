import { BadRequestException, Body, Controller, ForbiddenException, Get, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { Request, Response } from "express";
import { MembersService } from "../services/members.service";
import { CreateMembersDto } from "../dto/create-members.dto";
import { JwtTenantGuard } from "../../../common/guards/jwt-tenant.guard";
import { RolesGuard } from "../../../common/guards/roles.guard";
import { Roles } from "../../../common/decorators/roles.decorator";
import { Tenant } from "../../../common/decorators/tenant.decorator";
import { ReqUser } from "../../../common/decorators/req-user.decorator";
import { MemberLoginDto } from "../dto/member-login.dto";
import { MessageService } from "../services/message.service";
import { SendMembersCredentialsDto } from "../dto/send-members-credentials.dto";
import { PhoneVerificationService } from "../services/phone-verification.service";

@ApiTags("membership")
@ApiBearerAuth()
@Controller("iam/members")
// @UseGuards(JwtTenantGuard, RolesGuard) TODO: Create guard for member login
export class MembersController {
  constructor(
    private readonly service: MembersService,
    private readonly messageService: MessageService,
    private readonly phoneVerificationService: PhoneVerificationService,
  ) {}

  @Get()
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Get all members for a tenant (owner only)" })
  getMembers(
    @Tenant() tenantId: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    return this.service.getMembers(resolvedTenantId);
  }

  @Post()
  @ApiOperation({ summary: "Create default members for a clinic (owner, manager, member)" })
  @Roles("admin")
  createMembers(
    @Body() dto: CreateMembersDto,
    @Tenant() tenantId: string,
    @ReqUser("id") userId: string
  ) {
    const resolvedTenantId = tenantId ?? dto.tenantId ?? "self-service-tenant";
    const resolvedUserId = userId ?? dto.createdBy ?? "self-service";
    return this.service.createMembers(dto, resolvedTenantId, resolvedUserId);
  }

  @Post("login")
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // ✅ 5 requests per minute (brute force himoya)
  @ApiOperation({ summary: "Login member by member_id and password" })
  async login(@Body() dto: MemberLoginDto, @Res() res: Response) {
    const result = await this.service.login(dto.memberId, dto.password, undefined, res);
    return res.json(result);
  }

  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // ✅ 20 requests per minute (normal usage uchun)
  @ApiOperation({ summary: "Refresh access token using refresh token from cookie" })
  async refresh(@Req() req: Request, @Res() res: Response) {
    const refreshToken =
      req.cookies?.refresh_token || req.headers["x-refresh-token"];

    if (!refreshToken) {
      return res.status(401).json({
        error: "Refresh token not provided",
      });
    }

    try {
      const result = await this.service.refreshAccessToken(refreshToken);
      return res.json(result);
    } catch (error: any) {
      return res.status(401).json({
        error: error.message || "Invalid or expired refresh token",
      });
    }
  }

  @Post("logout")
  @ApiOperation({ summary: "Logout member and invalidate refresh token" })
  async logout(@Req() req: Request, @Res() res: Response) {
    const refreshToken = req.cookies?.refresh_token;
    console.log("[Logout] Refresh token from cookie:", refreshToken ? "exists" : "not found");

    // ✅ Refresh token bo'lsa, database'da invalid qilish
    if (refreshToken) {
      try {
        await this.service.logout(refreshToken);
        console.log("[Logout] Token invalidated in database");
      } catch (error) {
        // Error bo'lsa ham davom etish (cookie'ni o'chirish kerak)
        console.error("[Logout] Database invalidation error:", error);
      }
    }

    // ✅ Cookie'ni o'chirish - 2 xil usul bilan
    const isProduction = process.env.NODE_ENV === "production";
    console.log("[Logout] Clearing cookie, isProduction:", isProduction);
    
    // Usul 1: Cookie'ni maxAge: 0 qilib o'chirish (eng ishonchli)
    res.cookie("refresh_token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: 0, // ✅ Darhol o'chirish
      expires: new Date(0), // ✅ Expired qilish
    });

    // Usul 2: clearCookie (qo'shimcha)
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
    });

    // Usul 3: Cookie'ni bo'sh string va maxAge: -1 qilib o'chirish
    res.cookie("refresh_token", "", {
      httpOnly: true,
      secure: isProduction,
      sameSite: "strict",
      path: "/",
      maxAge: -1, // ✅ O'tmishga o'tkazish
    });

    console.log("[Logout] Cookie cleared");
    return res.json({ message: "Successfully logged out" });
  }

  @Post("logout-all")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Logout from all devices" })
  async logoutAll(@ReqUser("id") userId: string, @Res() res: Response) {
    await this.service.logoutAll(userId);

    // Cookie'ni o'chirish
    res.clearCookie("refresh_token", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    return res.json({ message: "Successfully logged out from all devices" });
  }

  @Post("send-credentials")
  @ApiOperation({ summary: "Send temporary passwords via SMS and KakaoTalk" })
  async sendCredentials(
    @Body() dto: SendMembersCredentialsDto,
    @Tenant() tenantId?: string
  ) {
    const resolvedTenantId = tenantId ?? "self-service-tenant";
    return this.messageService.sendMemberCredentials(
      dto.ownerPhoneNumber,
      dto.clinicName,
      dto.members
    );
  }

  @Post("change-password-first-login")
  @UseGuards(JwtTenantGuard)
  @ApiOperation({ summary: "Change password on first login (for temporary password)" })
  async changePasswordFirstLogin(
    @Body() body: { currentPassword: string; newPassword: string },
    @ReqUser("member_id") tokenMemberId: string,
    @ReqUser("must_change_password") mustChangePassword?: boolean,
    @Tenant() tenantId?: string
  ) {
    if (!tokenMemberId) {
      throw new BadRequestException("Member ID is required in token");
    }

    // ✅ Faqat must_change_password true bo'lsa ishlaydi
    if (!mustChangePassword) {
      throw new ForbiddenException("This endpoint is only for first-time password change");
    }

    const resolvedTenantId = tenantId ?? "self-service-tenant";
    await this.service.changePassword(
      tokenMemberId, // ✅ Faqat o'z member_id'si
      body.currentPassword,
      body.newPassword,
      resolvedTenantId
    );
    
    // ✅ JSON response qaytarish
    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  }

  @Post("change-password")
  @UseGuards(JwtTenantGuard, RolesGuard)
  @Roles("owner")
  @ApiOperation({ summary: "Change password (owner only - for account management)" })
  async changePassword(
    @Body() body: { memberId?: string; currentPassword?: string; newPassword: string },
    @ReqUser("member_id") tokenMemberId?: string,
    @Tenant() tenantId?: string,
    @Query("tenantId") tenantQuery?: string
  ) {
    // memberId'ni token'dan yoki body'dan olish
    const memberId = tokenMemberId || body.memberId;
    if (!memberId) {
      throw new BadRequestException(
        "Member ID is required. Either provide it in the request body (memberId) or ensure the JWT token contains member_id."
      );
    }
    // tenantId'ni guard'dan, query'dan yoki header'dan olish
    const resolvedTenantId = tenantId ?? tenantQuery ?? "self-service-tenant";
    
    // ✅ currentPassword optional bo'lishi mumkin (phone verification bilan)
    const currentPassword = body.currentPassword || "";
    
    await this.service.changePassword(
      memberId,
      currentPassword,
      body.newPassword,
      resolvedTenantId
    );
    
    // ✅ JSON response qaytarish
    return {
      success: true,
      message: "비밀번호가 성공적으로 변경되었습니다.",
    };
  }

  @Post('send-phone-verification')
@ApiOperation({ summary: 'Send phone verification code via SMS' })
async sendPhoneVerification(@Body() body: { phone_number: string }) {
  if (!body.phone_number) {
    throw new BadRequestException('Phone number is required');
  }
  return this.phoneVerificationService.sendVerificationCode(body.phone_number);
}

@Post('verify-phone-code')
@ApiOperation({summary: 'Verify phone verification code'})
async verifyPhoneCode(
  @Body() body: {phone_number: string, code:string}
) {
  if(!body.phone_number || !body.code) {
    throw new BadRequestException('Phone number and code are required')
  }
  return this.phoneVerificationService.verifyCode(body.phone_number, body.code)
}
}

