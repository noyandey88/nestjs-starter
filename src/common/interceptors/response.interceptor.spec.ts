import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';
import { ResponseInterceptor } from './response.interceptor';
import { RESPONSE_MESSAGE_KEY } from '../decorators/api-envelope.decorator';

describe('ResponseInterceptor', () => {
  const makeContext = (statusCode: number, handler: object) =>
    ({
      switchToHttp: () => ({
        getResponse: () => ({ statusCode }),
      }),
      getHandler: () => handler,
    }) as unknown as ExecutionContext;

  const makeNext = (value: unknown): CallHandler => ({
    handle: () => of(value),
  });

  it('wraps the payload with status name from the response status code', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext(200, () => {}),
        makeNext({ id: 1 }),
      ),
    );
    expect(result).toEqual({
      success: true,
      status: 'OK',
      message: 'Request successful',
      payload: { id: 1 },
    });
  });

  it('uses the message from ApiEnvelope route metadata', async () => {
    const handler = () => {};
    Reflect.defineMetadata(
      RESPONSE_MESSAGE_KEY,
      'Course created successfully',
      handler,
    );
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(makeContext(200, handler), makeNext({ id: 7 })),
    );
    expect(result.message).toBe('Course created successfully');
  });

  it('passes null payloads through as null', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext(200, () => {}),
        makeNext(null),
      ),
    );
    expect(result.payload).toBeNull();
  });

  it('converts undefined payloads to null', async () => {
    const interceptor = new ResponseInterceptor(new Reflector());
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext(200, () => {}),
        makeNext(undefined),
      ),
    );
    expect(result.payload).toBeNull();
  });

  it('works when constructed with no arguments (main.ts call form)', async () => {
    const interceptor = new ResponseInterceptor();
    const result = await lastValueFrom(
      interceptor.intercept(
        makeContext(200, () => {}),
        makeNext('Hello World!'),
      ),
    );
    expect(result).toEqual({
      success: true,
      status: 'OK',
      message: 'Request successful',
      payload: 'Hello World!',
    });
  });
});
