import { vi, type Mocked } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { CourseService } from './course.service.js';
import { CourseRepository } from './course.repository.js';

describe('CourseService', () => {
  let service: CourseService;
  let repository: Mocked<CourseRepository>;

  const course = {
    id: 1,
    name: 'Intro to TypeScript',
    description: 'A beginner-friendly TypeScript course',
    level: 'beginner',
    createdBy: 'creator@example.com',
    updatedBy: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    repository = {
      findAll: vi.fn(),
      findOne: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as unknown as Mocked<CourseRepository>;
    service = new CourseService(repository);
  });

  describe('create', () => {
    it('delegates to the repository with the creator email', async () => {
      repository.create.mockResolvedValue(course);
      const dto = {
        name: course.name,
        description: course.description,
        level: course.level,
      };

      const result = await service.create(dto, 'creator@example.com');

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.create).toHaveBeenCalledWith(
        dto,
        'creator@example.com',
      );
      expect(result).toEqual(course);
    });
  });

  describe('findAll', () => {
    it('returns all courses', async () => {
      repository.findAll.mockResolvedValue([course]);
      await expect(service.findAll()).resolves.toEqual([course]);
    });
  });

  describe('findOne', () => {
    it('returns the course when it exists', async () => {
      repository.findOne.mockResolvedValue(course);
      await expect(service.findOne(1)).resolves.toEqual(course);
    });

    it('throws NotFoundException when it does not exist', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('updates when the course exists', async () => {
      repository.findOne.mockResolvedValue(course);
      repository.update.mockResolvedValue({ ...course, name: 'Renamed' });

      const result = await service.update(
        1,
        { name: 'Renamed' },
        'editor@example.com',
      );

      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.update).toHaveBeenCalledWith(
        1,
        { name: 'Renamed' },
        'editor@example.com',
      );
      expect(result?.name).toBe('Renamed');
    });

    it('throws NotFoundException and does not update when missing', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.update(999, {}, 'e@example.com')).rejects.toThrow(
        NotFoundException,
      );
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('removes when the course exists', async () => {
      repository.findOne.mockResolvedValue(course);
      repository.remove.mockResolvedValue(undefined);
      await service.remove(1);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.remove).toHaveBeenCalledWith(1);
    });

    it('throws NotFoundException when missing', async () => {
      repository.findOne.mockResolvedValue(undefined);
      await expect(service.remove(999)).rejects.toThrow(NotFoundException);
      // eslint-disable-next-line @typescript-eslint/unbound-method
      expect(repository.remove).not.toHaveBeenCalled();
    });
  });
});
