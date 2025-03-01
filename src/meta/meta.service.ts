import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { lastValueFrom } from 'rxjs';
import { handleHttpError } from 'src/utils/util-functions.util';
import { WhatsAppReq, WhatsAppTemplateReq } from 'src/interfaces/whatsAppReq.interface';
import { MessengerReq } from 'src/interfaces/messenger.interface';

@Injectable()
export class MetaService {
    private readonly whatsappUrl: string;
    private readonly whatsappToken: string;
    private readonly whatsappBusinessAccountId: string;
    private readonly whatsappFromPhoneNumber: string;
    private readonly messengerToken: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.whatsappUrl = `${this.configService.get<string>('META_BASE_URL')}`;
        this.whatsappToken = `${this.configService.get<string>('META_WHATSAPP_TOKEN')}`;
        this.whatsappBusinessAccountId = `${this.configService.get<string>('META_WHATSAPP_BUSINESS_ACCOUNT_ID')}`;
        this.whatsappFromPhoneNumber = `${this.configService.get<string>('META_WHATSAPP_BUSINESS_NUMBER')}`;
        this.messengerToken = `${this.configService.get<string>('META_MESSENGER_TOKEN')}`;
    }

    async fetchWhatsAppTemplates() {
        try {
            const response = await lastValueFrom(
                this.httpService.get(`${this.whatsappUrl}/${this.whatsappBusinessAccountId}/message_templates`, { headers: this._getHeaders(this.whatsappToken) })
            );
            return response.data;
        } catch (error) {
            handleHttpError(error, 'Failed to fetch WhatsApp templates');
        }
    }

    async sendWhatsAppMessage(body: WhatsAppReq) {
        try {
            const response = await lastValueFrom(
                this.httpService.post(
                    `${this.whatsappUrl}/${this.whatsappFromPhoneNumber}/messages`,
                    {
                        messaging_product: 'whatsapp',
                        to: body.to, // Número destino
                        text: { body: body.message } // Mensaje a enviar
                    },
                    { headers: this._getHeaders(this.whatsappToken) }
                )
            );
            return response.data;
        } catch (error) {
            handleHttpError(error, 'Failed to send WhatsApp message');
        }
    }

    async sendWhatsAppMessageFromTemplate(body: WhatsAppTemplateReq) {
        const waBody = {
            messaging_product: 'whatsapp',
            to: body.to,
            type: 'template',
            template: {
                name: body.template, // Nombre de la plantilla (ejm. "Hola {{var_1}}, este es un mensaje con plantilla.")
                language: {
                    code: body.code ?? 'us', // Código del idioma (ejemplo: 'us' para inglés)
                },
                components: [
                    {
                        type: 'body',
                        parameters: body.templateParams?.map(t => ({
                            type: t.type,
                            text: t.text, // Valor para {{var_1}}
                        }))
                    }
                ]
            }
        };

        try {
            const response = await lastValueFrom(
                this.httpService.post(
                    `${this.whatsappUrl}/${this.whatsappFromPhoneNumber}/messages`,
                    waBody,
                    { headers: this._getHeaders(this.whatsappToken) }
                )
            );
            return response.data;
        } catch (error) {
            handleHttpError(error, 'Failed to send WhatsApp message from template');
        }
    }

    async sendMessengerMessage(body: MessengerReq) {
        try {
            const response = await lastValueFrom(
                this.httpService.post(
                    `${this.whatsappUrl}/me/messages`,
                    {
                        recipient: { id: body.recipientId },
                        message: { text: body.message },
                    },
                    { headers: this._getHeaders(this.messengerToken) }
                )
            );
            return response.data;
        } catch (error) {
            handleHttpError(error, 'Failed to send Messenger message');
        }
    }

    private _getHeaders(apiKey: string) {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        };
    }
}
