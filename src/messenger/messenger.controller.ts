import { Controller, Get, Post, Body, Query, Res, Logger, HttpStatus, Param } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessengerService } from './messenger.service';
import { SendMessageDto } from './dto/send-message.dto';
import { Response } from 'express';

@Controller('messenger')
export class MessengerController {
    private readonly logger = new Logger(MessengerController.name);
    private readonly metaWebhookVerifyToken: string;

    constructor(
        private readonly messengerService: MessengerService,
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
        this.logger.log('verifyWebhook()');
        if (mode && token && mode === 'subscribe' && token === this.metaWebhookVerifyToken) {
            this.logger.log('verifyWebhook() - Verificación de Webhook de Messenger exitosa.');
            return challenge;
        } else {
            this.logger.warn('verifyWebhook() - Fallo en la verificación del Webhook de Messenger.');
            return 'Error en la verificación';
        }
    }

    @Post('webhook')
    async receiveWebhook(@Body() body: any, @Res() res: Response) {
        this.logger.log('receiveWebhook() - Webhook de Messenger recibido:', JSON.stringify(body));
        if (body.object === 'page') {
            for (const entry of body.entry) {
                for (const event of entry.messaging) {
                    await this.messengerService.handleWebhook(event);
                }
            }
            return res.status(HttpStatus.OK).send('EVENT_RECEIVED');
        } else {
            return res.status(HttpStatus.BAD_REQUEST).send('Bad Request');
        }
    }

    @Post('send')
    async sendOutboundMessage(@Body() sendMessageDto: SendMessageDto) {
        this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${sendMessageDto.recipientId}`);
        return this.messengerService.sendOutboundMessage(sendMessageDto);
    }

    @Get('conversations')
    async getAllConversations() {
        this.logger.log('getAllConversations() - Listando todas las conversaciones de Messenger');
        return this.messengerService.getAllConversations();
    }

    @Get('conversations/:id/messages')
    async getConversationMessages(@Param('id') id: string) {
        this.logger.log(`Listando mensajes de la conversación de Messenger de ID: ${id}`);
        return this.messengerService.getConversationMessages(id);
    }
}
