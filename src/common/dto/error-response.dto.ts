import { ApiProperty } from '@nestjs/swagger';

/** Shape emitted by AllExceptionsFilter for every error response. */
export class ErrorResponseDto {
  @ApiProperty({ example: false })
  success!: boolean;

  @ApiProperty({
    example: 'BAD_REQUEST',
    description: 'HTTP status name',
  })
  status!: string;

  @ApiProperty({ example: 'Validation failed' })
  message!: string;

  @ApiProperty({
    example: null,
    type: 'object',
    nullable: true,
    additionalProperties: false,
  })
  payload!: null;
}
