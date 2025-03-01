import { IsString, IsNotEmpty } from 'class-validator';

export class SendMessageDto {
    @IsString({ message: 'Recipient Id no válido' })
    @IsNotEmpty({ message: 'Recipient Id requerido' })
    recipientId: string;

    @IsString({ message: 'Mensaje no válido' })
    @IsNotEmpty({ message: 'Mensaje requerido' })
    message: string;
}