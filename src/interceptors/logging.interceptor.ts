import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
    intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
        const now = Date.now();
        const request = context.switchToHttp().getRequest();

        console.log(
            `Handling ${request.method} ${request.url} - Body: ${JSON.stringify(
                request.body,
            )}`,
        );

        return next.handle().pipe(
            tap(() =>
                console.log(
                    `Finished ${request.method} ${request.url} in ${Date.now() - now
                    }ms`,
                ),
            ),
        );
    }
}
