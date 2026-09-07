import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CourseRepository } from './course.repository.js';

@Injectable()
export class CourseService {
  constructor(private readonly courseRepository: CourseRepository) {}

  async create(createCourseDto: CreateCourseDto, creatorEmail: string) {
    const course = await this.courseRepository.create(
      createCourseDto,
      creatorEmail,
    );
    return course;
  }

  async findAll() {
    const courses = await this.courseRepository.findAll();
    return courses;
  }

  async findOne(id: number) {
    const course = await this.courseRepository.findOne(id);

    if (course) {
      return course;
    }

    throw new NotFoundException(`Course with ID ${id} not found`);
  }

  async update(
    id: number,
    updateCourseDto: UpdateCourseDto,
    updaterEmail: string,
  ) {
    const course = await this.courseRepository.findOne(id);

    if (course) {
      return this.courseRepository.update(id, updateCourseDto, updaterEmail);
    }

    throw new NotFoundException(`Course with ID ${id} not found`);
  }

  async remove(id: number) {
    const course = await this.courseRepository.findOne(id);

    if (course) {
      return this.courseRepository.remove(id);
    }

    throw new NotFoundException(`Course with ID ${id} not found`);
  }
}
