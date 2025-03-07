import { Module } from '@nestjs/common';
import { MessengerController } from './messenger.controller';
import { MessengerService } from './messenger.service';
import { HttpModule } from '@nestjs/axios';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation } from 'src/entities/conversation.entity';
import { Message } from 'src/entities/message.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, Message]),
    HttpModule
  ],
  controllers: [MessengerController],
  providers: [MessengerService]
})
export class MessengerModule { }
