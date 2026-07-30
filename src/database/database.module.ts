import { Global, Module } from '@nestjs/common';
import { DatabaseProvider } from './database.provider';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [DatabaseProvider],
  exports: [DatabaseProvider],
})
export class DatabaseModule {}
