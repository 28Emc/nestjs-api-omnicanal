import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import axios from 'axios';
import { Conversation } from 'src/entities/conversation.entity';
import { Message } from 'src/entities/message.entity';
import { Repository } from 'typeorm';
import { SendMessageDto } from './dto/send-message.dto';
import { firstValueFrom } from 'rxjs';
import { ConversationChannel } from 'src/enums/conversation-channel.enum';
import { MessageDirection } from 'src/enums/message-direction.enum';
import { MessageStatus } from 'src/enums/message-status.enum';

@Injectable()
export class MessengerService {
    private readonly logger = new Logger(MessengerService.name);
    private readonly metaAppId: string;
    private readonly messengerToken: string;
    private readonly baseUrl: string;

    constructor(
        @InjectRepository(Conversation)
        private readonly conversationRepository: Repository<Conversation>,
        @InjectRepository(Message)
        private readonly messageRepository: Repository<Message>,
        private readonly httpService: HttpService,
        private readonly configService: ConfigService
    ) {
        this.metaAppId = this.configService.get<string>('META_APP_ID')!;
        this.messengerToken = this.configService.get<string>('META_MESSENGER_TOKEN')!;
        this.baseUrl = this.configService.get<string>('META_BASE_URL')!;
    }

    /**
     * Maneja mensajes entrantes de Messenger
     */
    async handleWebhook(event: any) {
        this.logger.log(`handleWebhook()`);
        const senderId = event.sender.id;
        const recipientId = event.recipient.id;
        const timestamp = event.timestamp;
        const messageId = event.message?.mid || event.delivery?.mids[0];
        const content = event.message?.text || null;

        if (event.message) {
            this.logger.log(`handleWebhook() - Procesando mensaje de Messenger, ID: ${messageId}`);
            const existingMessage = await this.messageRepository.findOne({
                where: { messageId: messageId }
            });

            if (existingMessage) {
                this.logger.warn(`handleWebhook() - Mensaje duplicado ignorado, ID: ${messageId}`);
                return;
            }

            const direction = recipientId === this.metaAppId
                ? MessageDirection.INBOUND
                : MessageDirection.OUTBOUND;
            let conversation = await this.conversationRepository.findOne({
                where: { contactId: senderId, channel: ConversationChannel.MESSENGER }
            });

            if (!conversation) {
                conversation = this.conversationRepository.create({
                    contactId: senderId,
                    channel: ConversationChannel.MESSENGER,
                    messages: []
                });
                await this.conversationRepository.save(conversation);
            }

            const newMessage = this.messageRepository.create({
                content: content,
                type: 'text',
                sender: senderId,
                messageId: messageId,
                direction: direction,
                status: MessageStatus.PENDING,
                timestamp: new Date(timestamp),
                conversation: conversation
            });
            await this.messageRepository.save(newMessage);
            this.logger.log(`handleWebhook() - Mensaje ${direction} guardado en Messenger, ID: ${newMessage.id}`);
        } else if (event.delivery || event.read) {
            const status = event.delivery ? MessageStatus.DELIVERED : MessageStatus.READ;
            this.logger.log(`handleWebhook() - Actualizando estado de mensaje ${messageId} a ${status}`);
            await this.messageRepository.update({ messageId: messageId }, { status: status });
        }
    }

    /**
     * Enviar mensaje en Messenger y persistir como OUTBOUND
     * direction = OUTBOUND (O)
     * status = SENT (S)
     */
    async sendOutboundMessage(sendMessageDto: SendMessageDto) {
        const { recipientId, message } = sendMessageDto;
        this.logger.log(`sendOutboundMessage() - Enviando mensaje a ${recipientId} en Messenger`);
        try {
            const payload = {
                messaging_type: 'RESPONSE',
                recipient: {
                    id: recipientId
                },
                message: {
                    text: message
                }
            };
            const url = `${this.baseUrl}/me/messages?access_token=${this.messengerToken}`;
            const response = await firstValueFrom(
                this.httpService.post(url, payload, {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                })
            );
            const messageId = response.data.message_id;
            this.logger.log(`sendOutboundMessage() - Mensaje enviado en Messenger, ID: ${messageId}`);
            let conversation = await this.conversationRepository.findOne({
                where: { contactId: recipientId, channel: ConversationChannel.MESSENGER }
            });

            if (!conversation) {
                conversation = this.conversationRepository.create({
                    contactId: recipientId,
                    channel: ConversationChannel.MESSENGER,
                    messages: []
                });
                await this.conversationRepository.save(conversation);
            }
            const newMessage = this.messageRepository.create({
                content: payload.message.text,
                type: 'text',
                sender: this.metaAppId,
                messageId: messageId,
                direction: MessageDirection.OUTBOUND,
                status: MessageStatus.SENT,
                conversation: conversation
            });
            await this.messageRepository.save(newMessage);
            this.logger.log(`sendOutboundMessage() - Mensaje OUTBOUND guardado en Messenger, ID: ${newMessage.id}`);

            // Confirmar entrega usando el webhook de estado
            await this._handleStatusWebhook({
                recipient_id: recipientId,
                message_id: messageId,
                status: MessageStatus.DELIVERED
            });
            return newMessage;
        } catch (error) {
            this.logger.error(`sendOutboundMessage() - Error al enviar mensaje a ${recipientId} en Messenger: ${error.response?.data || error.message}`);
            throw new HttpException('sendOutboundMessage() - Error al enviar mensaje de Messenger', HttpStatus.BAD_REQUEST);
        }
    }

    private async _handleStatusWebhook(statusUpdate: { recipient_id: string, message_id: string, status: MessageStatus }) {
        this.logger.log(`handleStatusWebhook() - Actualizando estado del mensaje ${statusUpdate.message_id} a ${statusUpdate.status}`);
        const { recipient_id, message_id, status } = statusUpdate;
        const message = await this.messageRepository.findOne({
            where: { messageId: message_id }
        });
        if (message) {
            message.status = status;
            await this.messageRepository.save(message);
            this.logger.log(`handleStatusWebhook() - Estado del mensaje ${message_id} actualizado a ${status}`);
        } else {
            this.logger.warn(`handleStatusWebhook() - No se encontró el mensaje con ID: ${message_id} para actualizar el estado`);
        }
    }

    /**
     * Listar todas las conversaciones agrupadas por cliente (contactId)
     */
    async getAllConversations() {
        this.logger.log('getAllConversations()');
        const channel = ConversationChannel.MESSENGER.valueOf();
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

        if (conversation.channel !== ConversationChannel.MESSENGER.valueOf()) {
            this.logger.error(`getConversationMessages() - Conversación incorrecta: ${conversationId}`);
            throw new NotFoundException('Conversación incorrecta');
        }

        const messages = conversation.messages;
        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        this.logger.log(`getConversationMessages() - Mensajes obtenidos para la conversación ID: ${conversationId}`);
        return messages;
    }
}
