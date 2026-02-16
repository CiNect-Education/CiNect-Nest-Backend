import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  constructor(private readonly config: ConfigService) {
    super({
      clientID: config.get<string>('GITHUB_CLIENT_ID') || 'not-configured',
      clientSecret: config.get<string>('GITHUB_CLIENT_SECRET') || 'not-configured',
      callbackURL: config.get<string>('GITHUB_CALLBACK_URL') ?? 'http://localhost:8080/api/v1/auth/github/callback',
      scope: ['user:email'],
    });
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: any,
    done: (err: any, user?: any) => void,
  ): Promise<void> {
    const { id, emails, displayName, username, photos } = profile;
    const user = {
      provider: 'GITHUB',
      providerId: String(id),
      email: emails?.[0]?.value,
      fullName: displayName || username,
      avatar: photos?.[0]?.value,
    };
    done(null, user);
  }
}
