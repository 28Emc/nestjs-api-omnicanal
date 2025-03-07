import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json(/* { verify: (req, res, buf) => { req.rawBody = buf; } } */));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,   // Elimina propiedades no definidas en DTOs
    forbidNonWhitelisted: true, // Rechaza propiedades no esperadas
    transform: true,   // Transforma datos a tipos esperados
  }));  

  // Configurar CORS
  app.enableCors({
    // origin: 'http://localhost:4222', // Cambia según tu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Añadir Helmet para proteger los headers HTTP
  app.use(helmet());

  await app.listen(process.env.PORT ?? 5555);
}
bootstrap();
