import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import helmet from 'helmet';
import * as bodyParser from 'body-parser';
import { ValidationPipe } from '@nestjs/common';
import { SignatureMiddleware } from './middlewares/signature.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.use(bodyParser.json({ verify: (req, res, buf) => { req.rawBody = buf; } }));

  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,   // Elimina propiedades no definidas en DTOs
    forbidNonWhitelisted: true, // Rechaza propiedades no esperadas
    transform: true,   // Transforma datos a tipos esperados
  }));

  app.use('/whatsapp/webhook', new SignatureMiddleware().use);
  app.use('/messenger/webhook', new SignatureMiddleware().use);

  // Configurar CORS
  app.enableCors({
    origin: 'http://localhost:4222', // Cambia según tu frontend
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
  });

  // Añadir Helmet para proteger los headers HTTP
  app.use(helmet());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
