import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { AppModule, ObserveInstrument } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/http-exception.filter.js';
import { DebugPayloadInterceptor } from './common/interceptors/debug-payload.interceptor.js';
import { ResponseInterceptor } from './common/interceptors/response.interceptor.js';

/**
 * Builds the fully configured application: instrumentation, logger,
 * security middleware, CORS, validation, envelope, error filter, and
 * Swagger. `main.ts` calls this and then listens; the e2e suite calls
 * it and then `init()`s, so tests exercise the same bootstrap as
 * production instead of a hand-assembled subset.
 */
export async function createApp(): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    instrument: ObserveInstrument,
  });
  const logger = app.get(Logger);
  app.useLogger(logger);
  app.enableShutdownHooks();

  app.use(helmet());

  const configService = app.get(ConfigService);
  const corsOrigins = (configService.get<string>('CORS_ORIGINS') ?? '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (corsOrigins.length > 0) {
    app.enableCors({ origin: corsOrigins });
    logger.log(`CORS enabled for origins: ${corsOrigins.join(', ')}`);
  } else {
    logger.warn(
      'CORS disabled (CORS_ORIGINS is empty); cross-origin browser requests will fail',
    );
  }

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );
  app.useGlobalInterceptors(new ResponseInterceptor());
  // Registered after ResponseInterceptor so it taps the raw payload.
  // Flag-gated: response payloads may contain PII.
  if (configService.get<boolean>('LOG_HTTP_BODIES')) {
    app.useGlobalInterceptors(new DebugPayloadInterceptor());
  }
  app.useGlobalFilters(new AllExceptionsFilter());

  if (configService.get<boolean>('SWAGGER_ENABLED')) {
    const config = new DocumentBuilder()
      .setTitle('Nestjs LMS')
      .setDescription('The LMS description')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT access token',
        },
        'access-token',
      )
      .build();
    const documentFactory = () => SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, documentFactory);
  }

  return app;
}
