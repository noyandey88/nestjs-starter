import { Module } from '@nestjs/common';
import { CourseService } from './course.service';
import { CourseController } from './course.controller';
import { DatabaseModule } from 'src/database/database.module';
import { CourseRepository } from './course.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepository],
})
export class CourseModule {}
