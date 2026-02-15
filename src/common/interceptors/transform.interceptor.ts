import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../dto/api-response.dto';

export interface Response<T> {
  data: T;
  meta?: Record<string, unknown>;
  message?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof ApiResponse) {
          return {
            ...result,
            timestamp: result.timestamp ?? new Date().toISOString(),
          } as ApiResponse<T>;
        }

        const response = result as Response<T>;
        return new ApiResponse({
          data: response?.data ?? (result as T),
          meta: response?.meta,
          message: response?.message,
          timestamp: new Date().toISOString(),
        });
      }),
    );
  }
}
