import { IsString, IsNotEmpty } from 'class-validator';

export class CreateMessageDto {
    @IsString({ message: 'Número destino no válido' })
    @IsNotEmpty({ message: 'Número destino requerido' })
    to: string;

    @IsString({ message: 'Mensaje no válido' })
    @IsNotEmpty({ message: 'Mensaje requerido' })
    message: string;
}
