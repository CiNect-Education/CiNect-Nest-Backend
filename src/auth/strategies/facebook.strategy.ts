import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-facebook';

@Injectable()
export class FacebookStrategy extends PassportStrategy(Strategy, 'facebook') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('FACEBOOK_APP_ID') || 'not-configured',
      clientSecret: config.get<string>('FACEBOOK_APP_SECRET') || 'not-configured',
      callbackURL: config.get<string>('FACEBOOK_CALLBACK_URL') ?? 'http://localhost:8080/api/v1/auth/facebook/callback',
      scope: ['email'],
      profileFields: ['id', 'emails', 'name', 'displayName', 'photos'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ): Promise<void> {
    const { id, emails, displayName, photos } = profile;
    const user = {
      provider: 'FACEBOOK',
      providerId: id,
      email: emails?.[0]?.value,
      fullName: displayName,
      avatar: photos?.[0]?.value,
    };
    done(null, user);
  }
}
