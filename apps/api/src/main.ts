import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { API_PREFIX, APP_NAME } from '@npr/shared';
import { AppModule } from './app.module.js';
import { configureApp } from './app.setup.js';
import { runScript } from './cli.js';
import { loadConfig } from './config.js';

await runScript(async () => {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(config));
  configureApp(app, config);
  app.enableShutdownHooks();
  await app.listen(config.port);

  const web = config.webDistDir ? `, web dari ${config.webDistDir}` : '';
  Logger.log(
    `${APP_NAME} (${config.env}) mendengarkan di port ${config.port}: API di /${API_PREFIX}${web}`,
    'Bootstrap',
  );
});
