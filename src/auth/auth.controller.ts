import { Controller, Post, Get, Put, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { FacebookAuthGuard } from '../common/guards/facebook-auth.guard';
import { GithubAuthGuard } from '../common/guards/github-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  oauthCallbackSuccessUrl,
  oauthLoginErrorUrl,
} from './oauth-redirect.util';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  private get frontendUrl(): string {
    return this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
  }

  private get defaultLocale(): string {
    return this.config.get<string>('DEFAULT_LOCALE') ?? 'vi';
  }

  private redirectOAuthSuccess(
    res: Response,
    tokens: { accessToken: string; refreshToken: string },
  ) {
    return res.redirect(
      oauthCallbackSuccessUrl(this.frontendUrl, tokens, this.defaultLocale),
    );
  }

  private redirectOAuthFailure(res: Response, code = 'oauth_failed') {
    return res.redirect(oauthLoginErrorUrl(this.frontendUrl, code, this.defaultLocale));
  }

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser('id') userId: string) {
    return this.authService.me(userId);
  }

  @Public()
  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Put('profile')
  updateProfile(@CurrentUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.authService.updateProfile(userId, dto);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@CurrentUser('id') userId: string) {
    return this.authService.logout(userId);
  }

  // ========================
  // OAuth: Google
  // ========================

  @Public()
  @Get('google')
  @UseGuards(GoogleAuthGuard)
  googleLogin() {
    // Guard redirects to Google consent screen
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleAuthGuard)
  async googleCallback(@Req() req: any, @Res() res: Response) {
    try {
      if (!req.user) {
        return this.redirectOAuthFailure(res, 'google_auth_failed');
      }
      const result = await this.authService.findOrCreateOAuthUser(req.user);
      return this.redirectOAuthSuccess(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch {
      return this.redirectOAuthFailure(res, 'google_auth_failed');
    }
  }

  // ========================
  // OAuth: Facebook
  // ========================

  @Public()
  @Get('facebook')
  @UseGuards(FacebookAuthGuard)
  facebookLogin() {
    // Guard redirects to Facebook consent screen
  }

  @Public()
  @Get('facebook/callback')
  @UseGuards(FacebookAuthGuard)
  async facebookCallback(@Req() req: any, @Res() res: Response) {
    try {
      if (!req.user) {
        return this.redirectOAuthFailure(res, 'facebook_auth_failed');
      }
      const result = await this.authService.findOrCreateOAuthUser(req.user);
      return this.redirectOAuthSuccess(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch {
      return this.redirectOAuthFailure(res, 'facebook_auth_failed');
    }
  }

  // ========================
  // OAuth: GitHub
  // ========================

  @Public()
  @Get('github')
  @UseGuards(GithubAuthGuard)
  githubLogin() {
    // Guard redirects to GitHub consent screen
  }

  @Public()
  @Get('github/callback')
  @UseGuards(GithubAuthGuard)
  async githubCallback(@Req() req: any, @Res() res: Response) {
    try {
      if (!req.user) {
        return this.redirectOAuthFailure(res, 'github_auth_failed');
      }
      const result = await this.authService.findOrCreateOAuthUser(req.user);
      return this.redirectOAuthSuccess(res, {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
      });
    } catch {
      return this.redirectOAuthFailure(res, 'github_auth_failed');
    }
  }
}
