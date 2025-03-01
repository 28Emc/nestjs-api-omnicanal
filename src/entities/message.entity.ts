import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    Unique,
    CreateDateColumn,
} from 'typeorm';
import { Conversation } from './conversation.entity';
import { MessageDirection } from '../enums/message-direction.enum';
import { MessageStatus } from '../enums/message-status.enum';

@Entity('messages')
@Unique(['messageId'])
export class Message {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    content: string;

    @Column({ nullable: false })
    type: string;

    @Column({ nullable: false })
    sender: string;

    @Column({ nullable: false, unique: true })
    messageId: string;

    @Column({
        type: 'enum',
        enum: MessageDirection,
        nullable: false,
    })
    direction: MessageDirection;

    @Column({
        type: 'enum',
        enum: MessageStatus,
        nullable: false,
        default: MessageStatus.PENDING,
    })
    status: MessageStatus;

    @CreateDateColumn()
    timestamp: Date;

    @ManyToOne(() => Conversation, (conversation) => conversation.messages, {
        onDelete: 'CASCADE',
    })
    conversation: Conversation;
}
