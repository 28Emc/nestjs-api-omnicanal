import { IsString, IsNotEmpty, IsArray } from 'class-validator';

export class CreateTemplateMessageDto {
    @IsString({ message: 'Campo "templateName" no válido' })
    @IsNotEmpty({ message: 'Campo "templateName" requerido' })
    templateName: string;

    @IsString({ message: 'Campo "code" no válida' })
    @IsNotEmpty({ message: 'Campo "code" requerido' })
    code: string;

    @IsString({ message: 'Campo "to" no válido' })
    @IsNotEmpty({ message: 'Campo "to" requerido' })
    to: string;

    @IsArray({ message: 'Campo "components" requerido' })
    components: TemplateMessageComponentsDto[];
}

export class TemplateMessageComponentsDto {
    @IsString({ message: 'Campo "type" no válido' })
    @IsNotEmpty({ message: 'Campo "type" requerido' })
    type: string;

    @IsString({ message: 'Campo "parameters" no válido' })
    @IsNotEmpty({ message: 'Campo "parameters" requerido' })
    parameters: string;
}

export class TemplateMessageParamsDto {
    @IsString({ message: 'Campo "type" no válido' })
    @IsNotEmpty({ message: 'Campo "type" requerido' })
    type: string;

    @IsString({ message: 'Campo "text" no válido' })
    @IsNotEmpty({ message: 'Campo "text" requerido' })
    text: string;
}
