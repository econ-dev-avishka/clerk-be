import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter that shapes every error into a consistent response envelope.
 *
 * @remarks
 * `@Catch()` with no argument intercepts ALL exceptions - both NestJS HttpExceptions
 * and unexpected runtime errors. Unknown errors are normalised to 500 so stack traces
 * never reach the client.
 *
 * The `correlation_id` in the response is populated by `CorrelationIdInterceptor`,
 * which must run before this filter to set the `x-correlation-id` request header.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
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
        ? this.resolveMessage(exception)
        : 'Internal server error';

    const errorCode =
      exception instanceof HttpException
        ? this.resolveErrorCode(exception)
        : 'INTERNAL_SERVER_ERROR';

    response.status(status).json({
      error_code: errorCode,
      message,
      correlation_id: request.headers['x-correlation-id'] ?? null,
    });
  }

  /**
   * @remarks
   * `ValidationPipe` errors arrive as `{ message: string[] }` - one string per
   * failed field. We join them so the envelope always has a single `message` string.
   */
  private resolveMessage(exception: HttpException): string {
    const response = exception.getResponse();

    if (typeof response === 'string') return response;

    // class-validator errors come as an array under response.message
    if (typeof response === 'object' && 'message' in response) {
      const msg = (response as Record<string, unknown>).message;
      return Array.isArray(msg) ? msg.join(', ') : String(msg);
    }

    return exception.message;
  }

  private resolveErrorCode(exception: HttpException): string {
    const status = exception.getStatus();

    const codes: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
    };

    return codes[status] ?? 'INTERNAL_SERVER_ERROR';
  }
}
