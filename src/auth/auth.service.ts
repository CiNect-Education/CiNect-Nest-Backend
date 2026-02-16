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
import { UserRole } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
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
      user: this.sanitizeUser(user),
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase(), isActive: true },
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
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
    };
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = this.jwt.verify(dto.refreshToken, {
        secret: this.config.get('JWT_SECRET'),
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
    return {
      ...this.sanitizeUser(user),
      roles: user.userRoles.map((ur) => ur.role.name),
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

    // In production, send email with reset link
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
    email: string;
    fullName: string;
    avatar?: string;
  }) {
    const { provider, providerId, email, fullName, avatar } = profile;

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
        where: { name: 'USER' },
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
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: this.sanitizeUser(user),
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

  private sanitizeUser(user: { id: string; email: string; fullName: string; phone: string | null; avatar: string | null }) {
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      phone: user.phone,
      avatar: user.avatar,
    };
  }
}
