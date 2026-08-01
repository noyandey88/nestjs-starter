import { ApiProperty, PartialType } from '@nestjs/swagger';
import { CreateCourseDto } from './create-course.dto';
import { IsString } from 'class-validator';

export class UpdateCourseDto extends PartialType(CreateCourseDto) {
  @ApiProperty()
  @IsString()
  name!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty()
  @IsString()
  level!: string;
}
