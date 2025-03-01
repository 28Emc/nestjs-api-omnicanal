import { Controller, Get, Post, Body, Query, Logger, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { CreateMessageDto } from './dto/create-message.dto';

@Controller('whatsapp')
export class WhatsappController {
    private readonly logger = new Logger(WhatsappController.name);
    private readonly metaWebhookVerifyToken: string;

    constructor(
        private readonly whatsappService: WhatsappService,
        private readonly configService: ConfigService,
    ) {
        this.metaWebhookVerifyToken = this.configService.get<string>('META_WEBHOOK_VERIFY_TOKEN')!;
    }

    @Get('webhook')
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string,
    ) {
        if (mode && token && mode === 'subscribe' && token === this.metaWebhookVerifyToken) {
            this.logger.log('verifyWebhook() - Verificación de Webhook de WhatsApp exitosa.');
            return challenge;
        } else {
            this.logger.warn('verifyWebhook() - Fallo en la verificación del Webhook de WhatsApp.');
            return 'Error en la verificación';
        }
    }

    @Post('webhook')
    async receiveWebhook(@Body() body: any) {
        this.logger.log('receiveWebhook() - Webhook de WhatsApp recibido:', JSON.stringify(body));
        await this.whatsappService.handleWebhook(body);
        return 'EVENT_RECEIVED';
    }

    @Post('send')
    async sendOutboundMessage(@Body() createMessageDto: CreateMessageDto) {
        this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${createMessageDto.to}`);
        return this.whatsappService.sendOutboundMessage(createMessageDto.to, createMessageDto.message);
    }

    @Get('conversations')
    async getAllConversations() {
        this.logger.log('getAllConversations() - Listando todas las conversaciones de WhatsApp');
        return this.whatsappService.getAllConversations();
    }

    @Get('conversations/:id/messages')
    async getConversationMessages(@Param('id') id: string) {
        this.logger.log(`Listando mensajes de la conversación de WhatsApp de ID: ${id}`);
        return this.whatsappService.getConversationMessages(id);
    }
}
