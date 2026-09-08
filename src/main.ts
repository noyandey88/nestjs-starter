import { ConfigService } from '@nestjs/config';
import { createApp } from './bootstrap.js';

const app = await createApp();
await app.listen(app.get(ConfigService).get<number>('PORT')!);
