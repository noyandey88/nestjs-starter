CREATE TABLE "courses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"level" varchar(100) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "courses_level_unique" UNIQUE("level")
);
