import { ApiProperty } from '@nestjs/swagger';

export class CourseResponseDto {
  @ApiProperty({ example: 1 })
  id!: number;

  @ApiProperty({ example: 'Intro to TypeScript' })
  name!: string;

  @ApiProperty({ example: 'A beginner-friendly TypeScript course' })
  description!: string;

  @ApiProperty({ example: 'beginner' })
  level!: string;

  @ApiProperty({ example: 'ada@example.com' })
  createdBy!: string;

  @ApiProperty({ example: 'ada@example.com', nullable: true, type: String })
  updatedBy!: string | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  createdAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  updatedAt!: Date | null;
}
