import { pgTable, text, serial, integer, boolean, timestamp, jsonb, real } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Technical roles for robust matching (shared)
export const technicalRoles = [
  'software engineer',
  'backend engineer',
  'frontend engineer',
  'full stack engineer',
  'machine learning engineer',
  'ai engineer',
  'data scientist',
  'devops engineer',
  'site reliability engineer',
  'qa engineer',
  'test engineer',
  'systems engineer',
  'embedded engineer',
  'cloud engineer',
  'platform engineer',
  'web developer',
  'mobile developer',
];

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  firebaseUid: text("firebase_uid").notNull().unique(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  bio: text("bio"),
  profileImage: text("profile_image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSignIn: timestamp("last_sign_in"),
});

export const interviews = pgTable("interviews", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => users.id).notNull(),
  role: text("role").notNull(),
  experienceLevel: text("experience_level").notNull(),
  status: text("status").notNull().default("in_progress"), // in_progress, completed, abandoned
  currentStage: integer("current_stage").notNull().default(1), // 1: MCQ, 2: Coding, 3: Voice
  overallScore: real("overall_score"),
  feedback: jsonb("feedback"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  durationMinutes: integer("duration_minutes").default(0),
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
  score: real("score"),
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
export type CodingProblem = typeof codingProblems.$inferSelect;

// --- Types for dynamic test harness generation ---
export type FunctionSignatureDetails = {
  functionName: string;
  parameters: Array<{
    name: string;
    abstractType: string;
    languageSpecificTypes: { [lang: string]: string };
  }>;
  returnType: string;
  exampleInputFormat?: string;
  exampleOutputFormat?: string;
};

export type TestCaseInput = {
  [paramName: string]: any;
};

// --- Coding Problems Table (User's Database Structure) ---
export const codingProblems = pgTable("coding_problems", {
  id: serial("id").primaryKey(),
  problemTitle: text("problem_title").notNull(),
  problemDescription: text("problem_description").notNull(),
  problemHardnessLevel: text("problem_hardness_level").notNull(), // easy, medium, hard
  constraints: text("constraints"),
  examples: jsonb("examples"), // JSON array with input/output examples
  testCases: jsonb("test_cases"), // JSON array with test cases for execution
  predefinedTemplates: jsonb("predefined_templates"), // JSON object with language templates
  stage: integer("stage").notNull().default(2), // Always 2 for coding
  type: text("type").notNull().default("coding"), // Always coding
  signaturePlaceholder: jsonb("signature_placeholder"), // JSON object with signatures per language
  testRunners: jsonb("test_runners"), // JSON object with test runner code per language
});

// --- Coding Problems and Test Cases Tables ---
export const problems = pgTable('problems', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  functionSignatureDetails: jsonb('function_signature_details').$type<FunctionSignatureDetails>().notNull(),
});

export const testCases = pgTable('test_cases', {
  id: serial('id').primaryKey(),
  problemId: integer('problem_id').references(() => problems.id).notNull(),
  inputData: jsonb('input_data').$type<TestCaseInput>().notNull(),
  expectedOutputData: jsonb('expected_output_data').$type<any>().notNull(),
});

// Export all tables as a schema object for Drizzle registration
export const schema = {
  users,
  interviews,
  questions,
  responses,
  codingProblems,
  problems,
  testCases,
};
