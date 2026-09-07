/* eslint-disable @typescript-eslint/unbound-method */
import { HttpStatus } from '@nestjs/common';
import { ApiEnvelope, RESPONSE_MESSAGE_KEY } from './api-envelope.decorator.js';

class DummyDto {}

describe('ApiEnvelope', () => {
  it('stores the message as route metadata', () => {
    class TestController {
      @ApiEnvelope(DummyDto, { message: 'Created it' })
      handler() {}
    }
    const meta: unknown = Reflect.getMetadata(
      RESPONSE_MESSAGE_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toBe('Created it');
  });

  it('defaults the message to "Request successful"', () => {
    class TestController {
      @ApiEnvelope(DummyDto)
      handler() {}
    }
    const meta: unknown = Reflect.getMetadata(
      RESPONSE_MESSAGE_KEY,
      TestController.prototype.handler,
    );
    expect(meta).toBe('Request successful');
  });

  it('sets the HTTP code metadata (default 200)', () => {
    class TestController {
      @ApiEnvelope(DummyDto)
      handler() {}
    }
    // __httpCode__ is the metadata key Nest's @HttpCode uses
    const code: unknown = Reflect.getMetadata(
      '__httpCode__',
      TestController.prototype.handler,
    );
    expect(code).toBe(HttpStatus.OK);
  });

  it('accepts null payload DTOs', () => {
    expect(() => {
      class TestController {
        @ApiEnvelope(null, { message: 'Logged out successfully' })
        handler() {}
      }
      void TestController;
    }).not.toThrow();
  });
});
