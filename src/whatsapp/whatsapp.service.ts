import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { firstValueFrom } from 'rxjs';
import { Conversation } from 'src/entities/conversation.entity';
import { Message } from 'src/entities/message.entity';
import { ConversationChannel } from 'src/enums/conversation-channel.enum';
import { MessageDirection } from 'src/enums/message-direction.enum';
import { MessageStatus } from 'src/enums/message-status.enum';
import { getHeaders } from 'src/utils/util-functions.util';
import { Repository } from 'typeorm';
import { CreateTemplateMessageDto } from './dto/create-template-message.dto';
import { randomUUID } from 'crypto';

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);
    private readonly whatsappToken: string;
    private readonly baseUrl: string;
    private readonly metaWhatsappBusinessNumber: string;
    private readonly metaWhatsappBusinessAccountId: string;

    constructor(
        @InjectRepository(Conversation)
        private readonly conversationRepository: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.whatsappToken = this.configService.get<string>('META_WHATSAPP_TOKEN')!;
        this.baseUrl = this.configService.get<string>('META_BASE_URL')!;
        this.metaWhatsappBusinessNumber = this.configService.get<string>('META_WHATSAPP_BUSINESS_NUMBER')!;
        this.metaWhatsappBusinessAccountId = this.configService.get<string>('META_WHATSAPP_BUSINESS_ACCOUNT_ID')!;
    }

    /**
     * Maneja mensajes entrantes de WhatsApp
     */
    async handleWebhook(body: any) {
        this.logger.log(`handleWebhook() - Recibiendo webhook: ${JSON.stringify(body)}`);
        if (body.object !== 'whatsapp_business_account' || !body.entry) {
            this.logger.warn('handleWebhook() - Webhook inválido o sin entradas');
            return;
        }

        try {
            for (const entry of body.entry) {
                for (const change of entry.changes || []) {
                    await this._processIncomingMessages(change.value?.messages);
                    await this._processStatusUpdates(change.value?.statuses);
                }
            }
        } catch (error) {
            this.logger.error(`handleWebhook() - Error procesando webhook: ${error.message}`, error.stack);
        }
    }

    private async _processIncomingMessages(messages?: any[]) {
        if (!messages) return;

        for (const message of messages) {
            this.logger.log('handleWebhook() - Procesando mensaje entrante');
            await this._handleIncomingMessage(message);
        }
    }

    private async _processStatusUpdates(statuses?: any[]) {
        if (!statuses) return;

        for (const status of statuses) {
            this.logger.log('handleWebhook() - Procesando actualización de estado');
            await this._handleStatusWebhook({
                recipient_id: status.recipient_id,
                message_id: status.id,
                status: status.status.toUpperCase()
            });
        }
    }

    /**
     * Maneja y persiste los estados de los mensajes     
     */
    async _handleStatusWebhook(statusUpdate: any) {
        this.logger.log(`_handleStatusWebhook() - Procesando actualización: ${JSON.stringify(statusUpdate)}`);
        const { recipient_id, message_id, status } = statusUpdate;

        try {
            const message = await this._findMessageById(message_id);

            if (!message) {
                this.logger.warn(`_handleStatusWebhook() - Mensaje no encontrado (ID: ${message_id})`);
                return;
            }

            await this._updateMessageStatus(message, message_id, status);
            this.logger.log(`_handleStatusWebhook() - Estado actualizado: ${message_id} -> ${status}`);
        } catch (error) {
            this.logger.error(`_handleStatusWebhook() - Error actualizando estado: ${error.message}`, error.stack);
        }
    }

    private async _findMessageById(messageId: string) {
        return this.messageRepository.findOne({ where: { messageId } });
    }

    /**
     * Maneja y persiste mensajes entrantes
     */
    private async _handleIncomingMessage(message: any) {
        try {
            const { from: phoneNumber, id: messageId, type } = message;
            const messageContent = this._extractMessageContent(message);
            const messageType = type || 'unknown';

            this.logger.log(`_handleIncomingMessage() - Mensaje entrante de ${phoneNumber}, ID: ${messageId}, Tipo: ${messageType}`);

            if (await this._isDuplicateMessage(messageId)) return;

            const conversation = await this._getOrCreateConversation(phoneNumber);
            const direction = this._determineMessageDirection(phoneNumber);

            await this._saveIncomingMessage(messageId, phoneNumber, messageContent, messageType, direction, conversation);

            this.logger.log(`_handleIncomingMessage() - Mensaje guardado correctamente, ID: ${messageId}`);
        } catch (error) {
            this.logger.error(`_handleIncomingMessage() - Error procesando mensaje: ${error.message}`, error.stack);
        }
    }

    /**
     * Extrae el contenido del mensaje basado en su tipo.
     */
    private _extractMessageContent(message: any): string {
        if (message.text) return message.text.body;
        if (message.template) return `[TEMPLATE] ${message.template.name}`;
        if (message.image) return `[IMAGE] ${message.image.id}`;
        if (message.audio) return `[AUDIO] ${message.audio.id}`;
        if (message.document) return `[DOCUMENT] ${message.document.id}`;
        if (message.video) return `[VIDEO] ${message.video.id}`;
        return '[UNKNOWN]';
    }

    private async _isDuplicateMessage(messageId: string): Promise<boolean> {
        const existingMessage = await this.messageRepository.findOne({ where: { messageId } });
        if (existingMessage) {
            this.logger.warn(`_handleIncomingMessage() - Mensaje duplicado ignorado: ${messageId}`);
            return true;
        }
        return false;
    }

    private _determineMessageDirection(phoneNumber: string): MessageDirection {
        return phoneNumber === this.metaWhatsappBusinessNumber ? MessageDirection.OUTBOUND : MessageDirection.INBOUND;
    }

    private async _saveIncomingMessage(
        messageId: string,
        sender: string,
        content: string,
        type: string,
        direction: MessageDirection,
        conversation: any
    ) {
        const newMessage = this.messageRepository.create({
            content,
            type,
            sender,
            messageId,
            direction,
            status: MessageStatus.DELIVERED,
            conversation,
        });

        await this.messageRepository.save(newMessage);
    }

    /**
     * Enviar mensaje de WhatsApp y persistir como OUTBOUND
     * direction = OUTBOUND (O)
     * status = SENT (S)
     */
    async sendOutboundMessage(to: string, content: string) {
        let newMessage: any;

        try {
            this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${to}`);

            const bodyWS = this._buildWhatsAppMessagePayload(to, content);
            const conversation = await this._getOrCreateConversation(to);
            // const newMessage = await this._createOutboundMessage(to, content, conversation);
            newMessage = await this._createOutboundMessage(to, content, conversation);

            await this._attemptToSendMessage(to, bodyWS, newMessage);
            return newMessage;
        } catch (error) {
            const errorData = error.response?.data || {};
            const errorCode = errorData.error?.code;
            let errorMessage = `Error desconocido al enviar mensaje a ${to}`;

            if (errorCode === 131026) {
                errorMessage = `El número ${to} no está registrado en WhatsApp.`;
            } else if (errorCode === 1006) {
                errorMessage = `El número ${to} es inválido.`;
            } else if (errorCode === 470) {
                errorMessage = `El usuario ${to} bloqueó el contacto o no permite mensajes.`;
            } else {
                errorMessage = `Error en la API de WhatsApp: ${JSON.stringify(errorData)}`;
            }

            // Actualizar estado del mensaje a FAILED
            newMessage.status = MessageStatus.FAILED;
            newMessage.errorReason = errorMessage;
            await this.messageRepository.save(newMessage);

            this.logger.error(`sendOutboundMessage() - ${errorMessage}`);
            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Construye la estructura del payload de WhatsApp.
     */
    private _buildWhatsAppMessagePayload(to: string, content: string) {
        return {
            messaging_product: 'whatsapp',
            to,
            type: 'text',
            text: { body: content }
        };
    }

    /**
     * Obtiene o crea una conversación para el destinatario.
     */
    private async _getOrCreateConversation(to: string) {
        let conversation = await this.conversationRepository.findOne({
            where: { contactId: to, channel: ConversationChannel.WHATSAPP }
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                contactId: to,
                channel: ConversationChannel.WHATSAPP,
                messages: []
            });
            await this.conversationRepository.save(conversation);
        }

        return conversation;
    }

    /**
     * Crea un mensaje de salida en estado PENDING.
     */
    private async _createOutboundMessage(to: string, content: string, conversation: any) {
        const newMessage = this.messageRepository.create({
            content: content,
            type: 'text',
            sender: process.env.META_WHATSAPP_BUSINESS_NUMBER,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.PENDING,
            messageId: randomUUID(), // Genera un ID único temporal
            conversation: conversation
        });
        return await this.messageRepository.save(newMessage);
    }

    /**
     * Intenta enviar el mensaje a la API de WhatsApp.
     */
    private async _attemptToSendMessage(to: string, bodyWS: any, message: any) {
        try {
            const url = `${this.baseUrl}/${this.metaWhatsappBusinessNumber}/messages`;
            const response = await firstValueFrom(
                this.httpService.post(url, bodyWS, { headers: getHeaders(this.whatsappToken) })
            );

            // Obtener el ID real del mensaje
            const realMessageId = response.data.messages[0]?.id;
            if (realMessageId) {
                message.messageId = realMessageId;
                message.status = MessageStatus.SENT;
                await this.messageRepository.save(message);
            }

            this.logger.log(`sendOutboundMessage() - Mensaje enviado a: ${to}, ID: ${realMessageId}`);

            // Confirmar DELIVERED
            await this._handleStatusWebhook({
                recipient_id: to,
                message_id: realMessageId,
                status: MessageStatus.DELIVERED
            });
        } catch (error) {
            message.status = MessageStatus.FAILED;
            await this.messageRepository.save(message);
            this.logger.error(`sendOutboundMessage() - Error al enviar mensaje a ${to}: ${error.response?.data || error.message}`);
            throw new HttpException('Error al enviar mensaje de WhatsApp', HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Actualiza el estado del mensaje en la base de datos.
     */
    private async _updateMessageStatus(message: any, messageId: string | null, status: MessageStatus) {
        message.messageId = messageId ?? message.messageId;
        message.status = status;
        await this.messageRepository.save(message);
    }

    /**
     * Enviar mensaje plantilla de WhatsApp y persistir como OUTBOUND
     * direction = OUTBOUND (O)
     * status = SENT (S)
     */
    async sendOutboundTemplateMessage(body: CreateTemplateMessageDto) {
        const { to, templateName, components, code } = body;
        let newMessage: any;

        try {
            this.logger.log(`sendOutboundTemplateMessage() - Enviando template '${templateName}' a ${to}`);

            const payload = this._buildTemplateMessagePayload(to, templateName, components, code);
            const response = await this._sendMessageToWhatsApp(payload);

            if (!response?.data?.messages) {
                throw new Error('No se recibió una confirmación válida de WhatsApp');
            }

            const messageText = await this._getTemplateText(templateName, components);
            const conversation = await this._getOrCreateConversation(to);
            newMessage = await this._createTemplateMessage(response.data.messages[0].id, to, messageText, conversation);

            return { message: 'Mensaje enviado', messageId: newMessage.id };
        } catch (error) {
            const errorData = error.response?.data || {};
            const errorCode = errorData.error?.code;
            let errorMessage = `Error desconocido al enviar mensaje de plantilla a ${to}`;

            if (errorCode === 131026) {
                errorMessage = `El número ${to} no está registrado en WhatsApp.`;
            } else if (errorCode === 1006) {
                errorMessage = `El número ${to} es inválido.`;
            } else if (errorCode === 470) {
                errorMessage = `El usuario ${to} bloqueó el contacto o no permite mensajes.`;
            } else {
                errorMessage = `Error en la API de WhatsApp: ${JSON.stringify(errorData)}`;
            }

            // Actualizar estado del mensaje a FAILED
            newMessage.status = MessageStatus.FAILED;
            newMessage.errorReason = errorMessage;
            await this.messageRepository.save(newMessage);

            this.logger.error(`sendOutboundTemplateMessage() - ${errorMessage}`);
            throw new HttpException(errorMessage, HttpStatus.BAD_REQUEST);
        }
    }

    /**
     * Construye la estructura del payload para enviar un mensaje de plantilla.
     */
    private _buildTemplateMessagePayload(to: string, templateName: string, components: any, code: string) {
        return {
            messaging_product: 'whatsapp',
            to,
            type: 'template',
            template: {
                name: templateName,
                language: { code },
                components
            }
        };
    }

    /**
     * Envía el mensaje a la API de WhatsApp.
     */
    private async _sendMessageToWhatsApp(payload: any) {
        const url = `${this.baseUrl}/${this.metaWhatsappBusinessNumber}/messages`;
        return firstValueFrom(
            this.httpService.post(url, payload, {
                headers: getHeaders(this.whatsappToken)
            })
        );
    }

    /**
     * Crea y guarda un mensaje de plantilla en la base de datos.
     */
    private async _createTemplateMessage(messageId: string, to: string, content: string, conversation: any) {
        const message = this.messageRepository.create({
            content,
            type: 'template',
            messageId,
            sender: this.metaWhatsappBusinessNumber,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.SENT,
            conversation
        });

        await this.messageRepository.save(message);
        this.logger.log(`sendOutboundTemplateMessage() - Template '${messageId}' enviado y guardado en conversación.`);

        return message;
    }

    /**
     * Obtener texto original de mensaje de plantilla a partir del nombre y variables.
     */
    private async _getTemplateText(templateName: string, components: any[]): Promise<string> {
        try {
            // Construir la URL para obtener las plantillas de mensajes
            const templateUrl = `https://graph.facebook.com/v17.0/${this.metaWhatsappBusinessAccountId}/message_templates`;

            // Realizar la solicitud GET para obtener las plantillas
            const response = await firstValueFrom(this.httpService.get(templateUrl, {
                headers: getHeaders(this.whatsappToken)
            }));

            // Extraer la lista de plantillas del cuerpo de la respuesta
            const templates = response.data?.data;
            if (!templates) {
                throw new Error('No se pudieron obtener las plantillas de mensajes.');
            }

            // Buscar la plantilla específica por nombre
            const template = templates.find((t: any) => t.name === templateName);
            if (!template) {
                throw new Error(`La plantilla '${templateName}' no está registrada.`);
            }

            // Obtener el contenido del cuerpo de la plantilla
            const bodyComponent = template.components.find((c: any) => c.type === 'BODY');
            if (!bodyComponent) {
                throw new Error(`La plantilla '${templateName}' no contiene un componente de cuerpo.`);
            }

            // Reemplazar las variables de la plantilla con los valores proporcionados en 'components'
            let messageText = bodyComponent.text;
            components.forEach((component, index) => {
                const placeholder = `{{${index + 1}}}`;
                messageText = messageText.replace(placeholder, component.text || '');
            });

            return messageText;
        } catch (error) {
            this.logger.error(`Error al obtener el texto de la plantilla '${templateName}': ${error.message}`);
            throw error;
        }
    }

    /**
     * Listar todas las conversaciones agrupadas por cliente (contactId)
     */
    async getAllConversations() {
        this.logger.log('getAllConversations()');
        const channel = ConversationChannel.WHATSAPP.valueOf();
        const query = this.conversationRepository
            .createQueryBuilder('conversation')
            .leftJoinAndSelect('conversation.messages', 'message')
            .where('conversation.channel = :channel', { channel })
            .orderBy('message.timestamp', 'ASC');

        if (channel) {
            query.andWhere('conversation.channel = :channel', { channel });
        }

        const conversations = await query.getMany();
        const result = conversations.map((conv) => {
            const lastMessage = conv.messages[conv.messages.length - 1];
            return {
                id: conv.id,
                contactId: conv.contactId,
                channel: conv.channel,
                lastMessage: lastMessage?.content,
                lastActivity: lastMessage?.timestamp,
                // status: conv.status,
            };
        });

        this.logger.log('getAllConversations() - Conversaciones obtenidas correctamente');
        return result;
    }

    /**
     * Obtener detalles de los mensajes de una conversación específica
     */
    async getConversationMessages(conversationId: string) {
        this.logger.log(`getConversationMessages() - ID: ${conversationId}`);
        const conversation = await this.conversationRepository.findOne({
            where: { id: conversationId },
            relations: ['messages']
        });

        if (!conversation) {
            this.logger.error(`getConversationMessages() - Conversación no encontrada: ${conversationId}`);
            throw new NotFoundException('Conversación no encontrada');
        }

        if (conversation.channel !== ConversationChannel.WHATSAPP.valueOf()) {
            this.logger.error(`getConversationMessages() - Conversación incorrecta: ${conversationId}`);
            throw new NotFoundException('Conversación incorrecta');
        }

        const messages = conversation.messages;
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        this.logger.log(`getConversationMessages() - Mensajes obtenidos para la conversación ID: ${conversationId}`);
        return messages;
    }
}
