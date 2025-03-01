import { Controller, Post, Body, Get, Query, HttpException, HttpStatus } from '@nestjs/common';
import { MetaService } from './meta.service';
import { WhatsAppReq, WhatsAppTemplateReq } from 'src/interfaces/whatsAppReq.interface';
import { MessengerReq } from 'src/interfaces/messenger.interface';

@Controller('meta')
export class MetaController {
    constructor(private readonly metaService: MetaService) { }

    @Post('whatsapp')
    async sendWhatsApp(@Body() body: WhatsAppReq) {
        return this.metaService.sendWhatsAppMessage(body);
    }

    @Get('whatsapp/templates')
    async fetchWhatsAppTemplates() {
        return this.metaService.fetchWhatsAppTemplates();
    }

    @Post('whatsapp/templates')
    async sendWhatsAppFromTemplate(@Body() body: WhatsAppTemplateReq) {
        return this.metaService.sendWhatsAppMessageFromTemplate(body);
    }

    @Post('messenger')
    async sendMessenger(@Body() body: MessengerReq) {
        return this.metaService.sendMessengerMessage(body);
    }

    // WEBHOOKS    

    // Endpoint para verificar el Webhook
    @Get('webhook')
    verifyWebhook(
        @Query('hub.mode') mode: string,
        @Query('hub.verify_token') token: string,
        @Query('hub.challenge') challenge: string
    ) {
        if (mode && token) {
            if (mode === 'subscribe' && token === process.env.META_WEBHOOK_VERIFY_TOKEN) {
                return challenge; // Meta espera el challenge como respuesta para validar el webhook.
            } else {
                throw new HttpException('Token de verificación inválido', HttpStatus.FORBIDDEN);
            }
        }
    }

    // Endpoint para recibir eventos
    @Post('webhook')
    handleWebhookEvents(@Body() body: any) {
        if (body.object === 'whatsapp_business_account') {
            // Eventos de WhatsApp Business API
            body.entry.forEach((entry: any) => {
                entry.changes.forEach((change: any) => {
                    if (change.value.messages) {
                        const message = change.value.messages[0];
                        const waId = message.from; // WhatsApp ID del usuario.
                    }
                });
            });
        } else if (body.object === 'page') {
            // Eventos de Messenger
            body.entry.forEach((entry: any) => {
                const webhookEvent = entry.messaging[0];
                const senderId = webhookEvent.sender.id; // PSID del usuario.
                if (webhookEvent.message) {
                }
            });
        }

        // Meta requiere una respuesta 200 OK para eventos.
        return { status: 'EVENT_RECEIVED' };
    }
}
