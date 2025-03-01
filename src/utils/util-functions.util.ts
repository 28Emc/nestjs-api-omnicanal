import { HttpException, HttpStatus } from '@nestjs/common';

export function handleHttpError(error: any, defaultMessage: string) {
    if (error.response) {
        console.error(`${defaultMessage}:`, error.response.data || null);
        // Error de la API externa
        throw new HttpException(
            error.response.data || defaultMessage,
            error.response.status || HttpStatus.BAD_REQUEST,
        );
    } else {
        // Error genérico o de conexión
        throw new HttpException(defaultMessage, HttpStatus.INTERNAL_SERVER_ERROR);
    }
}

export function getHeaders(apiKey: string) {
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
    };
}
