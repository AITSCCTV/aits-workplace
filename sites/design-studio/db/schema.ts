import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';
export const plans = sqliteTable('design_plans', {id:text('id').primaryKey(),ownerId:text('owner_id').notNull(),name:text('name').notNull(),revision:integer('revision').notNull(),objectKey:text('object_key').notNull(),createdAt:text('created_at').notNull(),updatedAt:text('updated_at').notNull()});
