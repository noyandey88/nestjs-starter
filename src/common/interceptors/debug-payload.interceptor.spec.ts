import { vi, type MockInstance } from 'vitest';
import { CallHandler, ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of } from 'rxjs';
import { DebugPayloadInterceptor } from './debug-payload.interceptor.js';

describe('DebugPayloadInterceptor', () => {
  const makeContext = (method: string, url: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
      }),
    }) as unknown as ExecutionContext;

  const makeNext = (value: unknown): CallHandler => ({
    handle: () => of(value),
  });

  let debugSpy: MockInstance;

  beforeEach(() => {
    debugSpy = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    debugSpy.mockRestore();
  });

  it('passes the payload through unchanged', async () => {
    const interceptor = new DebugPayloadInterceptor();
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext('GET', '/courses'),
        makeNext({ id: 1 }),
      ),
    );
    expect(result).toEqual({ id: 1 });
  });

  it('debug-logs method, url, and payload', async () => {
    const interceptor = new DebugPayloadInterceptor();
    await lastValueFrom(
      interceptor.intercept(
        makeContext('POST', '/auth/login'),
        makeNext({ accessToken: 'x' }),
      ),
    );
    expect(debugSpy).toHaveBeenCalledWith({
      method: 'POST',
      url: '/auth/login',
      payload: { accessToken: 'x' },
    });
  });
});
