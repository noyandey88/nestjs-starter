import { Module } from '@nestjs/common';
import { CourseService } from './course.service.js';
import { CourseController } from './course.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { CourseRepository } from './course.repository.js';

@Module({
  imports: [DatabaseModule],
  controllers: [CourseController],
  providers: [CourseService, CourseRepository],
})
export class CourseModule {}
