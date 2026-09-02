import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CourseModule } from './course/course.module';
import { HealthModule } from './health/health.module';
import { validateEnv } from './config/env.validation';
import { resolveEnvFiles } from './config/env-files';
import { createLoggerOptions } from './config/logger.config';
import { createObserveModule } from '@nestjs/observe';

export const { ObserveModule, ObserveInstrument } = createObserveModule();

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: resolveEnvFiles(process.env),
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      providers: [ConfigService],
      inject: [ConfigService],
      useFactory: createLoggerOptions,
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        throttlers: [
          {
            ttl: config.get<number>('THROTTLE_TTL')! * 1000, // throttler expects ms
            limit: config.get<number>('THROTTLE_LIMIT')!,
          },
        ],
      }),
    }),
    AuthModule,
    UserModule,
    DatabaseModule,
    CourseModule,
    HealthModule,
    ObserveModule.forRoot({
      appKey: String(process.env.OBSERVE_APP_KEY ?? ''),
      appSecret: String(process.env.OBSERVE_APP_SECRET ?? ''),
      serviceId: 'nestjs-lms',
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
