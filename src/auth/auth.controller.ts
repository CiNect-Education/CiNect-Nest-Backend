import { Controller, Post, Get, Body, UseGuards, Req, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { GoogleAuthGuard } from '../common/guards/google-auth.guard';
import { FacebookAuthGuard } from '../common/guards/facebook-auth.guard';
import { GithubAuthGuard } from '../common/guards/github-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

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
    const result = await this.authService.findOrCreateOAuthUser(req.user);
    const params = new URLSearchParams({
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
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
    const result = await this.authService.findOrCreateOAuthUser(req.user);
    const params = new URLSearchParams({
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
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
    const result = await this.authService.findOrCreateOAuthUser(req.user);
    const params = new URLSearchParams({
      token: result.accessToken,
      refreshToken: result.refreshToken,
    });
    return res.redirect(`${this.frontendUrl}/auth/callback?${params.toString()}`);
  }
}
