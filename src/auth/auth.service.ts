import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class AuthService {
    private readonly logger = new Logger(AuthService.name);
    private readonly appId: string;
    private readonly appSecret: string;
    private readonly baseUrl: string;

    constructor(private readonly configService: ConfigService) {
        this.appId = this.configService.get<string>('META_APP_ID')!;
        this.appSecret = this.configService.get<string>('META_APP_SECRET')!;
        this.baseUrl = this.configService.get<string>('META_BASE_URL')!;
    }

    async renewAccessToken(): Promise<string> {
        try {
            const url = `${this.baseUrl}/oauth/access_token?grant_type=client_credentials&client_id=${this.appId}&client_secret=${this.appSecret}`;
            const response = await axios.get(url);
            const newToken = response.data.access_token;

            this.logger.log('Token renovado correctamente.');
            return newToken;
        } catch (error) {
            this.logger.error('Error al renovar el token:', error.message);
            throw new Error('No se pudo renovar el token de acceso.');
        }
    }
}
