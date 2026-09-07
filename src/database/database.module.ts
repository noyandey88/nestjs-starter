import { Global, Module } from '@nestjs/common';
import {
  DatabaseLifecycle,
  DatabaseProvider,
  PoolProvider,
} from './database.provider.js';

@Global()
@Module({
  providers: [PoolProvider, DatabaseProvider, DatabaseLifecycle],
  exports: [DatabaseProvider],
})
export class DatabaseModule {}
