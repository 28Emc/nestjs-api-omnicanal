import { Controller, Get, Post, Body, Query, Logger, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WhatsappService } from './whatsapp.service';
import { CreateMessageDto } from './dto/create-message.dto';
import { CreateTemplateMessageDto } from './dto/create-template-message.dto';

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
            return 'ERROR';
        }
    }

    @Post('webhook')
    async receiveWebhook(@Body() body: any) {
        this.logger.log('receiveWebhook() - Webhook de WhatsApp recibido');
        await this.whatsappService.handleWebhook(body);
        return 'EVENT_RECEIVED';
    }

    @Post('send')
    async sendOutboundMessage(@Body() createMessageDto: CreateMessageDto) {
        this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${createMessageDto.to}`);
        return this.whatsappService.sendOutboundMessage(createMessageDto.to, createMessageDto.message);
    }

    @Post('send/template')
    async sendOutboundTemplateMessage(@Body() createTemplateMessageDto: CreateTemplateMessageDto) {
        this.logger.log(`sendOutboundTemplateMessage() - Enviando mensaje plantilla a ${createTemplateMessageDto.to}`);
        return this.whatsappService.sendOutboundTemplateMessage(createTemplateMessageDto);
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
