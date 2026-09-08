import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CourseService } from './course.service.js';
import { CreateCourseDto } from './dto/create-course.dto.js';
import { UpdateCourseDto } from './dto/update-course.dto.js';
import { CourseResponseDto } from './dto/course-response.dto.js';
import { UserRole } from '../user/user.types.js';
import { ApiEnvelope } from '../common/decorators/api-envelope.decorator.js';
import { ApiErrorResponses } from '../common/decorators/api-error-responses.decorator.js';
import { Auth } from '../common/decorators/auth.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';

@ApiTags('Courses')
@Auth()
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @Post('create')
  @ApiOperation({
    summary: 'Create a new course',
    description: 'Creates a new course using the provided details.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course created successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST)
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @CurrentUser('email') creatorEmail: string,
  ) {
    return this.courseService.create(createCourseDto, creatorEmail);
  }

  @Get('get/all')
  @ApiOperation({
    summary: 'Retrieve all courses',
    description: 'Fetches a list of all available courses.',
  })
  @ApiEnvelope(CourseResponseDto, {
    message: 'Courses retrieved successfully',
    isArray: true,
  })
  async findAll() {
    return this.courseService.findAll();
  }

  @Get('get/:id')
  @ApiOperation({
    summary: 'Retrieve a course by ID',
    description: 'Fetches a course by its unique identifier.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course retrieved successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.findOne(id);
  }

  @Patch('update/:id')
  @ApiOperation({
    summary: 'Update a course',
    description: 'Updates the details of an existing course.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course updated successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCourseDto: UpdateCourseDto,
    @CurrentUser('email') updaterEmail: string,
  ) {
    return this.courseService.update(id, updateCourseDto, updaterEmail);
  }

  @Delete('delete/:id')
  @Roles(UserRole.Admin)
  @ApiOperation({
    summary: 'Remove a course',
    description:
      'Deletes an existing course by its unique identifier. Admins only.',
  })
  @ApiEnvelope(CourseResponseDto, { message: 'Course removed successfully' })
  @ApiErrorResponses(HttpStatus.BAD_REQUEST, HttpStatus.NOT_FOUND)
  async remove(@Param('id', ParseIntPipe) id: number) {
    return this.courseService.remove(id);
  }
}
