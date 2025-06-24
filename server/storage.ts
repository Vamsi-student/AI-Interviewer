import { users, interviews, questions, responses, type User, type InsertUser, type Interview, type InsertInterview, type Question, type InsertQuestion, type Response, type InsertResponse } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  
  // Interview operations
  getInterview(id: number): Promise<Interview | undefined>;
  getInterviewsByUserId(userId: number): Promise<Interview[]>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: number, interview: Partial<Interview>): Promise<Interview | undefined>;
  
  // Question operations
  getQuestion(id: number): Promise<Question | undefined>;
  getQuestionsByInterviewId(interviewId: number): Promise<Question[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  
  // Response operations
  getResponse(id: number): Promise<Response | undefined>;
  getResponsesByInterviewId(interviewId: number): Promise<Response[]>;
  getResponsesByQuestionId(questionId: number): Promise<Response[]>;
  createResponse(response: InsertResponse): Promise<Response>;
  updateResponse(id: number, response: Partial<Response>): Promise<Response | undefined>;
}

export class MemStorage implements IStorage {
  private users: Map<number, User> = new Map();
  private interviews: Map<number, Interview> = new Map();
  private questions: Map<number, Question> = new Map();
  private responses: Map<number, Response> = new Map();
  private currentUserId = 1;
  private currentInterviewId = 1;
  private currentQuestionId = 1;
  private currentResponseId = 1;

  // User operations
  async getUser(id: number): Promise<User | undefined> {
    return this.users.get(id);
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.firebaseUid === firebaseUid);
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return Array.from(this.users.values()).find(user => user.email === email);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const id = this.currentUserId++;
    const user: User = {
      ...insertUser,
      id,
      createdAt: new Date(),
    };
    this.users.set(id, user);
    return user;
  }

  // Interview operations
  async getInterview(id: number): Promise<Interview | undefined> {
    return this.interviews.get(id);
  }

  async getInterviewsByUserId(userId: number): Promise<Interview[]> {
    return Array.from(this.interviews.values()).filter(interview => interview.userId === userId);
  }

  async createInterview(insertInterview: InsertInterview): Promise<Interview> {
    const id = this.currentInterviewId++;
    const interview: Interview = {
      ...insertInterview,
      id,
      status: insertInterview.status || 'in_progress',
      currentStage: insertInterview.currentStage || 1,
      overallScore: insertInterview.overallScore || null,
      feedback: insertInterview.feedback || null,
      createdAt: new Date(),
      completedAt: null,
    };
    this.interviews.set(id, interview);
    return interview;
  }

  async updateInterview(id: number, updates: Partial<Interview>): Promise<Interview | undefined> {
    const interview = this.interviews.get(id);
    if (!interview) return undefined;
    
    const updatedInterview = { ...interview, ...updates };
    this.interviews.set(id, updatedInterview);
    return updatedInterview;
  }

  // Question operations
  async getQuestion(id: number): Promise<Question | undefined> {
    return this.questions.get(id);
  }

  async getQuestionsByInterviewId(interviewId: number): Promise<Question[]> {
    return Array.from(this.questions.values()).filter(question => question.interviewId === interviewId);
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const id = this.currentQuestionId++;
    const question: Question = {
      ...insertQuestion,
      id,
      options: insertQuestion.options || null,
      correctAnswer: insertQuestion.correctAnswer || null,
      testCases: insertQuestion.testCases || null,
      aiGenerated: insertQuestion.aiGenerated !== undefined ? insertQuestion.aiGenerated : true,
      createdAt: new Date(),
    };
    this.questions.set(id, question);
    return question;
  }

  // Response operations
  async getResponse(id: number): Promise<Response | undefined> {
    return this.responses.get(id);
  }

  async getResponsesByInterviewId(interviewId: number): Promise<Response[]> {
    return Array.from(this.responses.values()).filter(response => response.interviewId === interviewId);
  }

  async getResponsesByQuestionId(questionId: number): Promise<Response[]> {
    return Array.from(this.responses.values()).filter(response => response.questionId === questionId);
  }

  async createResponse(insertResponse: InsertResponse): Promise<Response> {
    const id = this.currentResponseId++;
    const response: Response = {
      ...insertResponse,
      id,
      feedback: insertResponse.feedback || null,
      audioUrl: insertResponse.audioUrl || null,
      transcription: insertResponse.transcription || null,
      isCorrect: insertResponse.isCorrect || null,
      score: insertResponse.score || null,
      timeSpent: insertResponse.timeSpent || null,
      createdAt: new Date(),
    };
    this.responses.set(id, response);
    return response;
  }

  async updateResponse(id: number, updates: Partial<Response>): Promise<Response | undefined> {
    const response = this.responses.get(id);
    if (!response) return undefined;
    
    const updatedResponse = { ...response, ...updates };
    this.responses.set(id, updatedResponse);
    return updatedResponse;
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  async getInterview(id: number): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    return interview || undefined;
  }

  async getInterviewsByUserId(userId: number): Promise<Interview[]> {
    return await db.select().from(interviews).where(eq(interviews.userId, userId));
  }

  async createInterview(insertInterview: InsertInterview): Promise<Interview> {
    const [interview] = await db
      .insert(interviews)
      .values(insertInterview)
      .returning();
    return interview;
  }

  async updateInterview(id: number, updates: Partial<Interview>): Promise<Interview | undefined> {
    const [interview] = await db
      .update(interviews)
      .set(updates)
      .where(eq(interviews.id, id))
      .returning();
    return interview || undefined;
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    return question || undefined;
  }

  async getQuestionsByInterviewId(interviewId: number): Promise<Question[]> {
    return await db.select().from(questions).where(eq(questions.interviewId, interviewId));
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const [question] = await db
      .insert(questions)
      .values(insertQuestion)
      .returning();
    return question;
  }

  async getResponse(id: number): Promise<Response | undefined> {
    const [response] = await db.select().from(responses).where(eq(responses.id, id));
    return response || undefined;
  }

  async getResponsesByInterviewId(interviewId: number): Promise<Response[]> {
    return await db.select().from(responses).where(eq(responses.interviewId, interviewId));
  }

  async getResponsesByQuestionId(questionId: number): Promise<Response[]> {
    return await db.select().from(responses).where(eq(responses.questionId, questionId));
  }

  async createResponse(insertResponse: InsertResponse): Promise<Response> {
    const [response] = await db
      .insert(responses)
      .values(insertResponse)
      .returning();
    return response;
  }

  async updateResponse(id: number, updates: Partial<Response>): Promise<Response | undefined> {
    const [response] = await db
      .update(responses)
      .set(updates)
      .where(eq(responses.id, id))
      .returning();
    return response || undefined;
  }
}

export const storage = new DatabaseStorage();
