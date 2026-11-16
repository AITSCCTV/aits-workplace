import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const tasks = sqliteTable('tasks', {id:text('id').primaryKey(), data:text('data').notNull(), revision:integer('revision').notNull().default(1), updated:text('updated').notNull()});
export const events = sqliteTable('events', {id:text('id').primaryKey(), taskId:text('task_id').notNull(), data:text('data').notNull(), at:text('at').notNull()});
export const progressProjects = sqliteTable('progress_projects', {id:text('id').primaryKey(), data:text('data').notNull(), revision:integer('revision').notNull().default(1), updated:text('updated').notNull()});
export const progressHistory = sqliteTable('progress_history', {id:text('id').primaryKey(), projectId:text('project_id').notNull(), revision:integer('revision').notNull(), data:text('data').notNull(), at:text('at').notNull()});
