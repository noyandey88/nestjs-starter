import { AllExceptionsFilter } from './http-exception.filter';
import { ConflictException, HttpStatus, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let mockStatus: jest.Mock;
  let mockJson: jest.Mock;
  let mockArgumentsHost: ArgumentsHost;

  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    filter = new AllExceptionsFilter();
    mockStatus = jest.fn().mockReturnThis();
    mockJson = jest.fn().mockReturnThis();

    const mockResponse = {
      status: mockStatus,
      json: mockJson,
    };

    mockArgumentsHost = {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  });

  it('should handle ConflictException and return 409 status with message', () => {
    const exception = new ConflictException('Email already in use');

    filter.catch(exception, mockArgumentsHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      status: 'CONFLICT',
      message: 'Email already in use',
      payload: null,
    });
  });

  it('should handle database duplicate key error (code 23505)', () => {
    const dbError = { code: '23505', message: 'duplicate key value' };

    filter.catch(dbError, mockArgumentsHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      status: 'CONFLICT',
      message: 'A record with this value already exists',
      payload: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });
});
