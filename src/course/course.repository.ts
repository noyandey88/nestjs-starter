import { CreateCourseDto } from './dto/create-course.dto';
import { Inject, Injectable } from '@nestjs/common';
import * as schema from '../database/schema';
import { courses } from '../database/schema';
import { DRIZZLE_ORM } from 'src/database/database.constants';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { UpdateCourseDto } from './dto/update-course.dto';

type Course = InferSelectModel<typeof courses>;
type NewCourse = InferInsertModel<typeof courses>;

@Injectable()
export class CourseRepository {
  constructor(
    @Inject(DRIZZLE_ORM) private readonly db: NodePgDatabase<typeof schema>,
  ) {}

  async findAll(): Promise<Course[]> {
    return await this.db.select().from(courses);
  }

  async findOne(id: number): Promise<Course | undefined> {
    return await this.db.query.courses.findFirst({ where: eq(courses.id, id) });
  }

  async create(
    courseData: CreateCourseDto,
    creatorEmail: string,
  ): Promise<NewCourse> {
    const [course] = await this.db
      .insert(courses)
      .values({ ...courseData, createdBy: creatorEmail })
      .returning();

    return course;
  }

  async update(
    id: number,
    courseData: UpdateCourseDto,
    updaterEmail: string,
  ): Promise<Course | undefined> {
    const [course] = await this.db
      .update(courses)
      .set({ ...courseData, updatedBy: updaterEmail })
      .where(eq(courses.id, id))
      .returning();

    return course;
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(courses).where(eq(courses.id, id));
  }
}
