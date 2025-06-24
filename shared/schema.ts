import { pgTable, text, serial, integer, boolean, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull(),
  experienceLevel: text("experience_level").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress, completed, abandoned
  currentStage: integer("current_stage").notNull().default(1), // 1: MCQ, 2: Coding, 3: Voice
  overallScore: integer("overall_score"),
  feedback: jsonb("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
});

export const questions = pgTable("questions", {
  id: serial("id").primaryKey(),
  interviewId: integer("interview_id").references(() => interviews.id).notNull(),
  stage: integer("stage").notNull(), // 1: MCQ, 2: Coding, 3: Voice
  type: text("type").notNull(), // mcq, coding, voice
  question: text("question").notNull(),
  options: jsonb("options"), // For MCQ questions
  correctAnswer: text("correct_answer"), // For MCQ questions
  testCases: jsonb("test_cases"), // For coding questions
  aiGenerated: boolean("ai_generated").default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const responses = pgTable("responses", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id").references(() => questions.id).notNull(),
  interviewId: integer("interview_id").references(() => interviews.id).notNull(),
  answer: text("answer").notNull(),
  audioUrl: text("audio_url"), // For voice responses
  transcription: text("transcription"), // For voice responses
  isCorrect: boolean("is_correct"),
  score: integer("score"),
  feedback: jsonb("feedback"),
  timeSpent: integer("time_spent"), // in seconds
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
});

export const insertInterviewSchema = createInsertSchema(interviews).omit({
  id: true,
  createdAt: true,
  completedAt: true,
});

export const insertQuestionSchema = createInsertSchema(questions).omit({
  id: true,
  createdAt: true,
});

export const insertResponseSchema = createInsertSchema(responses).omit({
  id: true,
  createdAt: true,
});

export type User = typeof users.$inferSelect;
export type InsertUser = z.infer<typeof insertUserSchema>;
export type Interview = typeof interviews.$inferSelect;
export type InsertInterview = z.infer<typeof insertInterviewSchema>;
export type Question = typeof questions.$inferSelect;
export type InsertQuestion = z.infer<typeof insertQuestionSchema>;
export type Response = typeof responses.$inferSelect;
export type InsertResponse = z.infer<typeof insertResponseSchema>;
