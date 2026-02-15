import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      user?: { id: string; email?: string };
      body?: unknown;
      params?: Record<string, string>;
      ip?: string;
      headers?: { 'user-agent'?: string };
    }>();

    const method = request.method?.toUpperCase();
    const auditMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];

    if (!auditMethods.includes(method)) {
      return next.handle();
    }

    const userId = request.user?.id ?? null;
    const userEmail = request.user?.email ?? null;
    const action = `${method} ${request.url}`;
    const entityType = this.deriveEntityType(request.url);
    const entityId = request.params?.id ?? null;
    const ipAddress = request.ip ?? (request.headers as Record<string, string>)?.['x-forwarded-for'] ?? null;
    const userAgent = request.headers?.['user-agent'] ?? null;
    const newValues = request.body ? (request.body as object) : null;

    return next.handle().pipe(
      tap({
        next: async () => {
          try {
            await this.prisma.auditLog.create({
              data: {
                userId,
                userEmail,
                action,
                entityType,
                entityId,
                newValues: newValues ? JSON.parse(JSON.stringify(newValues)) : undefined,
                ipAddress: ipAddress ? String(ipAddress).split(',')[0].trim() : null,
                userAgent,
              },
            });
          } catch (err) {
            console.error('[AuditInterceptor] Failed to write audit log:', err);
          }
        },
      }),
    );
  }

  private deriveEntityType(url: string): string {
    const match = url.match(/\/api\/v1\/([^/?]+)/);
    return match ? match[1] : 'unknown';
  }
}
