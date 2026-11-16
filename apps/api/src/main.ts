import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { APP_NAME } from '@tyio/shared';
import { AppModule } from './app.module.js';

const port = Number(process.env.PORT ?? 3000);

const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(port);
Logger.log(`${APP_NAME} API mendengarkan di port ${port}`, 'Bootstrap');
