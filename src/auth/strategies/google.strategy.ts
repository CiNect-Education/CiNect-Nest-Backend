import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback } from 'passport-google-oauth20';

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private readonly config: ConfigService) {
    const clientID = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const callbackURL =
      config.get<string>('GOOGLE_CALLBACK_URL') ??
      'http://localhost:3001/api/v1/auth/google/callback';

    if (!clientID?.trim() || !clientSecret?.trim()) {
      Logger.warn(
        'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET missing — Google login will fail until .env is configured.',
      );
    }

    super({
      clientID: clientID?.trim() || 'not-configured',
      clientSecret: clientSecret?.trim() || 'not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    });

    this.logger.log(`Google OAuth callback URL: ${callbackURL}`);
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ): Promise<void> {
    const { id, emails, displayName, photos } = profile;
    const user = {
      provider: 'GOOGLE',
      providerId: id,
      email: emails?.[0]?.value,
      fullName: displayName,
      avatar: photos?.[0]?.value,
    };
    done(null, user);
  }
}
