import 'reflect-metadata';
import { plainToInstance, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  validateSync,
} from 'class-validator';

export const NODE_ENVS = ['development', 'production', 'test'] as const;
export type NodeEnv = (typeof NODE_ENVS)[number];

export class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  PORT: number = 3000;

  @IsIn(NODE_ENVS)
  @IsOptional()
  NODE_ENV: NodeEnv = 'development';

  /** Access-token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_ACCESS_EXPIRES_IN: number = 300;

  /** Refresh-token lifetime in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN: number = 604800;

  /** Comma-separated list of allowed origins. Empty disables CORS. */
  @IsString()
  @IsOptional()
  CORS_ORIGINS: string = '';

  /** Rate-limit window in seconds. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_TTL: number = 60;

  /** Max requests per window per client. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  THROTTLE_LIMIT: number = 100;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(validated, {
    whitelist: true,
    forbidUnknownValues: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`,
      )
      .join('\n  ');
    throw new Error(`Environment validation failed:\n  ${details}`);
  }
  return validated;
}
