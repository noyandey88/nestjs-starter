import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  HttpCode,
  HttpStatus,
  UseGuards,
  Request,
  ForbiddenException,
  ParseIntPipe,
} from '@nestjs/common';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { ApiBearerAuth, ApiBody, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ResponseBuilder } from 'src/common/dto/api-response.dto';
import { AuthGuard } from 'src/auth/auth.guard';
import { UserRole } from 'src/user/user.types';

@ApiTags('Courses')
@Controller('courses')
export class CourseController {
  constructor(private readonly courseService: CourseService) {}

  @ApiBody({ type: CreateCourseDto })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Post('create')
  @ApiOperation({
    summary: 'Create a new course',
    description: 'Creates a new course using the provided details.',
  })
  async create(
    @Body() createCourseDto: CreateCourseDto,
    @Request() req: { user: { email: string } },
  ) {
    const creatorEmail = req.user.email || 'anonymous';
    const result = await this.courseService.create(
      createCourseDto,
      creatorEmail,
    );
    return ResponseBuilder.success(result, 'Course created successfully');
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Get('get/all')
  @ApiOperation({
    summary: 'Retrieve all courses',
    description: 'Fetches a list of all available courses.',
  })
  async findAll() {
    const result = await this.courseService.findAll();
    return ResponseBuilder.success(result, 'Courses retrieved successfully');
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Get('get/:id')
  @ApiOperation({
    summary: 'Retrieve a course by ID',
    description: 'Fetches a course by its unique identifier.',
  })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const result = await this.courseService.findOne(id);
    return ResponseBuilder.success(result, 'Course retrieved successfully');
  }

  @ApiBody({ type: UpdateCourseDto })
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Patch('update/:id')
  @ApiOperation({
    summary: 'Update a course',
    description: 'Updates the details of an existing course.',
  })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateCourseDto: UpdateCourseDto,
    @Request() req: { user: { email: string } },
  ) {
    const updaterEmail = req.user.email || 'anonymous';
    const result = await this.courseService.update(
      id,
      updateCourseDto,
      updaterEmail,
    );
    return ResponseBuilder.success(result, 'Course updated successfully');
  }

  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @UseGuards(AuthGuard)
  @Delete('delete/:id')
  @ApiOperation({
    summary: 'Remove a course',
    description: 'Deletes an existing course by its unique identifier.',
  })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: { user: { role: UserRole } },
  ) {
    const role = req.user.role;

    if (role !== UserRole.Admin) {
      throw new ForbiddenException(
        'You do not have permission to delete this course',
      );
    }

    const result = await this.courseService.remove(id);
    return ResponseBuilder.success(result, 'Course removed successfully');
  }
}
