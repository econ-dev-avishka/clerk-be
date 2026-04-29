import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'crypto';

export const CORRELATION_ID_HEADER = 'x-correlation-id';

/**
 * Ensures every request and response carries an `x-correlation-id` header.
 *
 * @remarks
 * If the client sends the header, that value is reused - this lets a frontend
 * trace a request end-to-end across services using its own generated ID.
 * If no header is present, a new UUID is generated for this request.
 *
 * The ID is set on the *request* object so `HttpExceptionFilter` can read it
 * when building error envelopes, even when the handler throws before responding.
 */
@Injectable()
export class CorrelationIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const correlationId =
      (request.headers[CORRELATION_ID_HEADER] as string) ?? randomUUID();

    request.headers[CORRELATION_ID_HEADER] = correlationId;

    return next
      .handle()
      .pipe(
        tap(() => response.setHeader(CORRELATION_ID_HEADER, correlationId)),
      );
  }
}
