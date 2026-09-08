import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { UserModule } from './user/user.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CourseModule } from './course/course.module.js';
import { HealthModule } from './health/health.module.js';
import { validateEnv } from './config/env.validation.js';
import { resolveEnvFiles } from './config/env-files.js';
import { createLoggerOptions } from './config/logger.config.js';
import { createObserveModule } from '@nestjs/observe';
import { Pool } from 'pg';

// Loads the env-file cascade into process.env synchronously, so the
// observe decision below can read the validated keys before the
// module graph is assembled.
const configModule = ConfigModule.forRoot({
  isGlobal: true,
  validate: validateEnv,
  envFilePath: resolveEnvFiles(process.env),
});

const observeAppKey = process.env.OBSERVE_APP_KEY;
const observeAppSecret = process.env.OBSERVE_APP_SECRET;
/** Observe only runs when both credentials are present; otherwise the
 *  agent worker would spin and get 401s on every telemetry batch. */
export const observeEnabled = Boolean(observeAppKey && observeAppSecret);

export const { ObserveModule, ObserveInstrument } = createObserveModule({
  // pg-pool calls `new this.Promise(...)`; observe's method proxy is a
  // plain function, so instrumenting the Pool breaks every query.
  skipInstrumentation: (instance) => instance instanceof Pool,
});

@Module({
  imports: [
    configModule,
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
    ...(observeEnabled
      ? [
          ObserveModule.forRoot({
            appKey: observeAppKey!,
            appSecret: observeAppSecret!,
            serviceId: 'nestjs-lms',
          }),
        ]
      : []),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
