import { Injectable, NestMiddleware, BadRequestException, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class SignatureMiddleware implements NestMiddleware {
    private readonly logger = new Logger(SignatureMiddleware.name);

    use(req: Request, res: Response, next: NextFunction) {
        const signature = req.headers['x-hub-signature-256'] as string;
        const body = req.body;
        const appSecret = process.env.META_APP_SECRET;

        if (!signature || !appSecret) {
            this.logger.warn('Firma o App Secret no presentes.');
            throw new BadRequestException('Firma o App Secret no presentes.');
        }

        const hash = `sha256=${crypto.createHmac('sha256', appSecret).update(body).digest('hex')}`;
        if (hash !== signature) {
            this.logger.warn('Firma inválida.');
            throw new BadRequestException('Firma inválida.');
        }

        this.logger.log('Firma verificada correctamente.');
        next();
    }
}
