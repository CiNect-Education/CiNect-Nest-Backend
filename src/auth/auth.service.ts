import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { unlink } from 'fs/promises';
import { join } from 'path';
import { AVATAR_UPLOAD_DIR } from '../uploads/avatar-upload.config';
import { EmailService } from '../email/email.service';
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly emailService: EmailService,
  ) {}

  async register(dto: RegisterDto) {
    if (dto.confirmPassword !== dto.password) {
      throw new BadRequestException('Passwords do not match');
    }

    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const bronzeTier = await this.prisma.membershipTier.findFirst({
      where: { name: 'Bronze' },
    });
    if (!bronzeTier) {
      throw new ConflictException('Membership tiers not seeded');
    }

    const userRole = await this.prisma.role.findFirst({
      where: { name: UserRole.USER },
    });
    if (!userRole) {
      throw new ConflictException('Roles not seeded');
    }

    const hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: {
          email: dto.email.toLowerCase(),
          passwordHash: hash,
          fullName: dto.fullName,
          phone: dto.phone,
          city: dto.city,
        },
      });

      await tx.userRoleJoin.create({
        data: { userId: u.id, roleId: userRole.id },
      });

      await tx.membership.create({
        data: {
          userId: u.id,
          tierId: bronzeTier.id,
        },
      });

      return u;
    });

    const tokens = await this.generateTokens(user.id, user.email);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      // Newly registered users always start as USER.
      user: this.sanitizeUser(user, [UserRole.USER]),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase(), isActive: true },
      include: {
        userRoles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException(
        'This account uses social login. Please sign in with your social provider.',
      );
    }

    const match = await bcrypt.compare(dto.password, user.passwordHash);
    if (!match) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } } },
    });
    const roles =
      userWithRoles?.userRoles.map((ur) => ur.role.name) ??
      // Defensive fallback; should not happen if roles were seeded.
      [UserRole.USER];
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(userWithRoles ?? user, roles),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwt.verify(dto.refreshToken, {
        secret: this.config.get<string>('JWT_SECRET') ?? 'development-secret',
      });
      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub, isActive: true },
      });
      if (!user || user.refreshToken !== dto.refreshToken) {
        throw new UnauthorizedException('Invalid refresh token');
      }

      const tokens = await this.generateTokens(user.id, user.email);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { refreshToken: tokens.refreshToken },
      });

      return {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        user: this.sanitizeUser(user),
      };
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: { include: { role: true } },
        memberships: { include: { tier: true } },
      },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const roles = user.userRoles.map((ur) => ur.role.name);
    return {
      ...this.sanitizeUser(user, roles),
      roles,
      membership: user.memberships[0]?.tier
        ? {
            tier: user.memberships[0].tier.name,
            level: user.memberships[0].tier.level,
            points: user.memberships[0].currentPoints,
          }
        : null,
    };
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (!user) {
      return { message: 'If the email exists, a reset link will be sent' };
    }

    const token = randomBytes(32).toString('hex');
    const exp = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken: token,
        resetTokenExp: exp,
      },
    });

    await this.emailService.sendPasswordResetEmail({
      to: user.email,
      token,
      userName: user.fullName,
      expiresMinutes: 60,
    });

    return { message: 'If the email exists, a reset link will be sent' };
  }

  async resetPassword(dto: ResetPasswordDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: dto.token,
        resetTokenExp: { gt: new Date() },
      },
    });
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const hash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash: hash,
        resetToken: null,
        resetTokenExp: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { userRoles: { include: { role: true } } },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Normalize fields
    const normalizedFullName =
      dto.fullName !== undefined ? this.normalize(dto.fullName) : undefined;
    const normalizedPhone =
      dto.phone !== undefined ? this.normalize(dto.phone) : undefined;
    const normalizedAvatar =
      dto.avatar !== undefined ? this.normalize(dto.avatar) : undefined;
    const normalizedGender =
      dto.gender !== undefined ? this.normalize(dto.gender) : undefined;
    const normalizedCity =
      dto.city !== undefined ? this.normalize(dto.city) : undefined;

    // Validate dateOfBirth if provided
    let parsedDob: Date | undefined;
    if (dto.dateOfBirth !== undefined) {
      parsedDob = new Date(dto.dateOfBirth);
      if (parsedDob >= new Date()) {
        throw new BadRequestException('Date of birth must be in the past');
      }
    }

    const data: any = {};
    if (normalizedFullName !== undefined && normalizedFullName !== null) {
      data.fullName = normalizedFullName;
    }
    if (normalizedPhone !== undefined) data.phone = normalizedPhone;
    if (normalizedAvatar !== undefined) {
      if (normalizedAvatar !== user.avatar) {
        await this.tryDeleteManagedAvatar(user.avatar);
      }
      data.avatar = normalizedAvatar;
    }
    if (parsedDob !== undefined) data.dateOfBirth = parsedDob;
    if (normalizedGender !== undefined) data.gender = normalizedGender;
    if (normalizedCity !== undefined) data.city = normalizedCity;
    if (dto.profilePublic !== undefined) data.profilePublic = dto.profilePublic;

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data,
      include: { userRoles: { include: { role: true } } },
    });

    const roles = updated.userRoles.map((ur) => ur.role.name);
    return this.sanitizeUser(updated, roles);
  }

  async uploadAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (!file?.filename) {
      throw new BadRequestException('No image uploaded');
    }

    const url = this.buildAvatarPublicUrl(file.filename);
    return { url };
  }

  private get publicApiUrl(): string {
    const configured = this.config.get<string>('PUBLIC_API_URL')?.trim();
    if (configured) {
      return configured.replace(/\/$/, '');
    }
    const port = this.config.get<string>('PORT') ?? '3001';
    return `http://localhost:${port}`;
  }

  private buildAvatarPublicUrl(filename: string): string {
    return `${this.publicApiUrl}/uploads/avatars/${filename}`;
  }

  private isManagedAvatarUrl(url: string | null | undefined): boolean {
    if (!url) return false;
    try {
      return new URL(url).pathname.includes('/uploads/avatars/');
    } catch {
      return false;
    }
  }

  private managedAvatarFilename(url: string): string | null {
    try {
      const segments = new URL(url).pathname.split('/').filter(Boolean);
      const idx = segments.lastIndexOf('avatars');
      if (idx === -1 || idx >= segments.length - 1) return null;
      return segments[idx + 1] ?? null;
    } catch {
      return null;
    }
  }

  private async tryDeleteManagedAvatar(url: string | null | undefined): Promise<void> {
    if (!this.isManagedAvatarUrl(url)) return;
    const filename = this.managedAvatarFilename(url!);
    if (!filename) return;
    try {
      await unlink(join(AVATAR_UPLOAD_DIR, filename));
    } catch {
      // Ignore missing files
    }
  }

  async logout(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
    return { message: 'Logged out successfully' };
  }

  async findOrCreateOAuthUser(profile: {
    provider: string;
    providerId: string;
    email?: string | null;
    fullName?: string | null;
    avatar?: string | null;
  }) {
    if (!profile?.provider || !profile?.providerId) {
      throw new BadRequestException('Invalid OAuth profile');
    }

    const { provider, providerId } = profile;
    const email = profile.email?.trim() || null;
    const fullName = profile.fullName?.trim() || email?.split('@')[0] || 'CiNect User';
    const avatar = profile.avatar ?? undefined;

    // 1. Check if user exists by provider + providerId
    let user = await this.prisma.user.findFirst({
      where: { provider, providerId },
    });

    if (!user && email) {
      // 2. Check if user exists by email — link the provider
      user = await this.prisma.user.findUnique({
        where: { email: email.toLowerCase() },
      });

      if (user) {
        user = await this.prisma.user.update({
          where: { id: user.id },
          data: { provider, providerId, avatar: user.avatar || avatar },
        });
      }
    }

    if (!user) {
      // 3. Create new user (no password, emailVerified=true)
      const userRole = await this.prisma.role.findFirst({
        where: { name: UserRole.USER },
      });
      const bronzeTier = await this.prisma.membershipTier.findFirst({
        where: { name: 'Bronze' },
      });

      user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: {
            email: email?.toLowerCase() ?? `${provider.toLowerCase()}_${providerId}@oauth.local`,
            fullName,
            avatar,
            provider,
            providerId,
            emailVerified: true,
            isActive: true,
          },
        });

        if (userRole) {
          await tx.userRoleJoin.create({
            data: { userId: u.id, roleId: userRole.id },
          });
        }

        if (bronzeTier) {
          await tx.membership.create({
            data: { userId: u.id, tierId: bronzeTier.id },
          });
        }

        return u;
      });
    }

    const tokens = await this.generateTokens(user.id, user.email);
    const userWithRoles = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: { userRoles: { include: { role: true } } },
    });
    const roles =
      userWithRoles?.userRoles.map((ur) => ur.role.name) ??
      // Defensive fallback; should not happen if roles were seeded.
      [UserRole.USER];
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(userWithRoles ?? user, roles),
    };
  }

  private async generateTokens(userId: string, email: string) {
    const secret = this.config.get<string>('JWT_SECRET') ?? 'development-secret';
    const accessExp = parseInt(this.config.get<string>('JWT_ACCESS_SECONDS') ?? '900', 10);
    const refreshExp = parseInt(this.config.get<string>('JWT_REFRESH_SECONDS') ?? '604800', 10);

    const accessToken = this.jwt.sign(
      { sub: userId, email, type: 'access' },
      { secret, expiresIn: accessExp },
    );

    const refreshToken = this.jwt.sign(
      { sub: userId, email, type: 'refresh' },
      { secret, expiresIn: refreshExp },
    );

    await this.prisma.user.update({
      where: { id: userId },
      data: { refreshToken },
    });

    return { accessToken, refreshToken };
  }

  private pickPrimaryRole(roles: UserRole[] | undefined): UserRole {
    const set = new Set(roles ?? []);
    if (set.has(UserRole.ADMIN)) return UserRole.ADMIN;
    if (set.has(UserRole.STAFF)) return UserRole.STAFF;
    return UserRole.USER;
  }

  private normalize(value: string | null | undefined): string | null {
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length === 0 ? null : trimmed;
  }

  private normalizeRequired(value: string | null | undefined, fieldName: string): string {
    if (!value) {
      throw new BadRequestException(`${fieldName} is required`);
    }
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      throw new BadRequestException(`${fieldName} cannot be empty`);
    }
    return trimmed;
  }

  private sanitizeUser(
    user: {
      id: string;
      email: string;
      fullName: string;
      phone: string | null;
      avatar: string | null;
      gender?: string | null;
      city?: string | null;
      dateOfBirth?: Date | null;
      isActive?: boolean;
      emailVerified?: boolean;
      createdAt?: Date;
      updatedAt?: Date;
    },
    roles?: UserRole[],
  ) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone ?? null,
      avatar: user.avatar ?? null,
      gender: user.gender ?? null,
      city: user.city ?? null,
      dateOfBirth: user.dateOfBirth ? user.dateOfBirth.toISOString() : null,
      isActive: user.isActive ?? true,
      emailVerified: user.emailVerified ?? false,
      role: this.pickPrimaryRole(roles),
      createdAt: user.createdAt ? user.createdAt.toISOString() : null,
      updatedAt: user.updatedAt ? user.updatedAt.toISOString() : null,
    };
  }
}
