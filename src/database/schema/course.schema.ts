import { pgTable, serial, timestamp, varchar } from 'drizzle-orm/pg-core';

export const courses = pgTable('courses', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 100 }).notNull(),
  description: varchar('description', { length: 255 }).notNull(),
  level: varchar('level', { length: 100 }).unique().notNull(),
  createdBy: varchar('created_by', { length: 100 }).notNull(),
  updatedBy: varchar('updated_by', { length: 100 }),
  createdAt: timestamp('created_at', {
    withTimezone: true,
    mode: 'date',
  }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
    .defaultNow()
    .$onUpdate(() => new Date()),
});
