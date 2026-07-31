CREATE TYPE "public"."user_role" AS ENUM('admin', 'student');--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'student' NOT NULL;