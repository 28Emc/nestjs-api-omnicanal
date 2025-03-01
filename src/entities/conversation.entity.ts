import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ConversationChannel } from 'src/enums/conversation-channel.enum';
import { Message } from './message.entity';

@Entity('conversations')
export class Conversation {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ nullable: false })
    contactId: string; // Número de teléfono o ID de usuario

    @Column({
        type: 'enum',
        enum: ConversationChannel,
        nullable: false,
    })
    channel: ConversationChannel;

    @OneToMany(() => Message, (message) => message.conversation, {
        cascade: true,
    })
    messages: Message[];

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}
