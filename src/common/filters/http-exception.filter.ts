import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../dto/api-response.dto';
import {
  isOAuthCallbackPath,
  oauthLoginErrorUrl,
} from '../../auth/oauth-redirect.util';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const errorResponse =
      typeof message === 'object' && message !== null && 'message' in message
        ? (message as { message: string | string[]; seatIds?: string[] })
        : null;

    const errorText = errorResponse
      ? Array.isArray(errorResponse.message)
        ? errorResponse.message.join(', ')
        : errorResponse.message
      : typeof message === 'object' && message !== null && 'message' in message
        ? (message as { message: string | string[] }).message
        : String(message);

    const errorDetail =
      typeof message === 'object' && message !== null && 'error' in message
        ? (message as { error: string }).error
        : undefined;

    const errorBody =
      errorResponse && Array.isArray(errorResponse.seatIds)
        ? { message: errorText, seatIds: errorResponse.seatIds }
        : typeof errorText === 'string'
          ? errorText
          : { message: errorText, ...(errorDetail && { detail: errorDetail }) };

    const body = new ApiResponse({
      data: null,
      error: errorBody,
      timestamp: new Date().toISOString(),
    });

    if (status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} ${status} - ${JSON.stringify(errorBody)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    // OAuth callbacks: never show raw JSON — send user back to login with an error code.
    if (isOAuthCallbackPath(request.url)) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
      const locale = process.env.DEFAULT_LOCALE ?? 'vi';
      const oauthError =
        request.url.includes('/google/') ? 'google_auth_failed' : 'oauth_failed';
      response.redirect(oauthLoginErrorUrl(frontendUrl, oauthError, locale));
      return;
    }

    response.status(status).json(body);
  }
}
