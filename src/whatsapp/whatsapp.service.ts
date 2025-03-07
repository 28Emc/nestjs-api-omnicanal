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

@Injectable()
export class WhatsappService {
    private readonly logger = new Logger(WhatsappService.name);
    private readonly whatsappToken: string;
    private readonly baseUrl: string;
    private readonly metaWhatsappBusinessNumber: string;

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
    }

    /**
     * Maneja mensajes entrantes de WhatsApp
     */
    async handleWebhook(body: any) {
        this.logger.log(`handleWebhook()`);
        try {
            if (body.object === 'whatsapp_business_account') {
                for (const entry of body.entry) {
                    const changes = entry.changes;
                    for (const change of changes) {
                        if (change.value && change.value.messages) {
                            for (const message of change.value.messages) {
                                this.logger.log('handleWebhook() - Procesando mensaje entrante');
                                await this._handleIncomingMessage(message);
                            }
                        }

                        if (change.value && change.value.statuses) {
                            for (const status of change.value.statuses) {
                                this.logger.log('handleWebhook() - Procesando actualización de estado');
                                await this._handleStatusWebhook({
                                    recipient_id: status.recipient_id,
                                    message_id: status.id,
                                    status: status.status.toUpperCase()
                                });
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.logger.error('handleWebhook() - Error procesando Webhook de WhatsApp:', error.message);
        }
    }

    /**
     * Maneja y persiste los estados de los mensajes     
     */
    async _handleStatusWebhook(statusUpdate: { recipient_id: string, message_id: string, status: MessageStatus }) {
        this.logger.log(`_handleStatusWebhook() - Actualizando estado del mensaje ${statusUpdate.message_id} a ${statusUpdate.status}`);
        const { recipient_id, message_id, status } = statusUpdate;
        const message = await this.messageRepository.findOne({
            where: { messageId: message_id }
        });
        if (message) {
            message.status = status;
            await this.messageRepository.save(message);
            this.logger.log(`_handleStatusWebhook() - Estado del mensaje ${message_id} actualizado a ${status}`);
        } else {
            this.logger.warn(`_handleStatusWebhook() - No se encontró el mensaje con ID: ${message_id} para actualizar el estado`);
        }
    }

    /**
     * Maneja y persiste mensajes entrantes
     * direction = INBOUND (I)
     * status = DELIVERED (D)
     */
    private async _handleIncomingMessage(message: any) {
        const phoneNumber = message.from;
        const messageId = message.id;
        const text = message.text?.body || '';
        this.logger.log(`_handleIncomingMessage() - Mensaje entrante de ${phoneNumber}, ID: ${messageId}`);

        const existingMessage = await this.messageRepository.findOne({
            where: { messageId: messageId },
        });

        if (existingMessage) {
            this.logger.warn(`_handleIncomingMessage() - Mensaje duplicado ignorado: ${messageId}`);
            return;
        }

        let conversation = await this.conversationRepository.findOne({
            where: { contactId: phoneNumber, channel: ConversationChannel.WHATSAPP },
        });

        if (!conversation) {
            conversation = this.conversationRepository.create({
                contactId: phoneNumber,
                channel: ConversationChannel.WHATSAPP,
                messages: [],
            });
            await this.conversationRepository.save(conversation);
        }

        const directionToSave = phoneNumber === this.metaWhatsappBusinessNumber
            ? MessageDirection.OUTBOUND
            : MessageDirection.INBOUND;
        const newMessage = this.messageRepository.create({
            content: text,
            type: 'text',
            sender: phoneNumber,
            messageId: messageId,
            direction: directionToSave,
            status: MessageStatus.DELIVERED,
            conversation: conversation,
        });
        await this.messageRepository.save(newMessage);
        this.logger.log(`_handleIncomingMessage() - Mensaje entrante guardado, ID: ${newMessage.id}`);
    }

    /**
     * Enviar mensaje de WhatsApp y persistir como OUTBOUND
     * direction = OUTBOUND (O)
     * status = SENT (S)
     */
    async sendOutboundMessage(to: string, content: string) {
        this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${to}`);
        const bodyWS = {
            messaging_product: 'whatsapp',
            to: to,
            type: 'text',
            text: {
                body: content
            }
        };

        // Persistencia inicial como OUTBOUND y PENDING
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

        const newMessage = this.messageRepository.create({
            content: content,
            type: 'text',
            sender: process.env.META_WHATSAPP_BUSINESS_NUMBER,
            direction: MessageDirection.OUTBOUND,
            status: MessageStatus.PENDING,
            conversation: conversation
        });
        await this.messageRepository.save(newMessage);
        this.logger.log(`sendOutboundMessage() - Mensaje OUTBOUND creado como PENDING, ID: ${newMessage.id}`);

        // Intento de envío
        try {
            const url = `${this.baseUrl}/${this.metaWhatsappBusinessNumber}/messages`;
            const response = await firstValueFrom(
                this.httpService.post(url, bodyWS, {
                    headers: getHeaders(this.whatsappToken)
                })
            );

            // Actualizar mensaje a SENT
            const messageId = response.data.messages[0].id;
            newMessage.messageId = messageId;
            newMessage.status = MessageStatus.SENT;
            await this.messageRepository.save(newMessage);
            this.logger.log(`sendOutboundMessage() - Mensaje enviado a: ${to}, ID: ${messageId}`);

            // Confirmar DELIVERED utilizando _handleStatusWebhook
            await this._handleStatusWebhook({
                recipient_id: to,
                message_id: messageId,
                status: MessageStatus.DELIVERED
            });

            return newMessage;
        } catch (error) {
            // Actualizar mensaje como FAILED si hay error en el envío
            newMessage.status = MessageStatus.FAILED;
            await this.messageRepository.save(newMessage);
            this.logger.error(`sendOutboundMessage() - Error al enviar mensaje a ${to}: ${error.response?.data || error.message}`);
            throw new HttpException('Error al enviar mensaje de WhatsApp', HttpStatus.BAD_REQUEST);
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
            .orderBy('message.timestamp', 'DESC');

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
