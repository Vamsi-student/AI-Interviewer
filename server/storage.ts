import { users, interviews, questions, responses, type User, type InsertUser, type Interview, type InsertInterview, type Question, type InsertQuestion, type Response, type InsertResponse } from "@shared/schema";
import { db } from "./db";
import { eq } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: number): Promise<User | undefined>;
  getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, updates: Partial<User>): Promise<User | undefined>;
  
  // Interview operations
  getInterview(id: number): Promise<Interview | undefined>;
  getInterviewsByUserId(userId: number): Promise<Interview[]>;
  createInterview(interview: InsertInterview): Promise<Interview>;
  updateInterview(id: number, interview: Partial<Interview>): Promise<Interview | undefined>;
  deleteInterview(id: number): Promise<void>;
  
  // Question operations
  getQuestion(id: number): Promise<Question | undefined>;
  getQuestionsByInterviewId(interviewId: number): Promise<Question[]>;
  createQuestion(question: InsertQuestion): Promise<Question>;
  deleteQuestion(id: number): Promise<void>;
  
  // Response operations
  getResponse(id: number): Promise<Response | undefined>;
  getResponsesByInterviewId(interviewId: number): Promise<Response[]>;
  getResponsesByQuestionId(questionId: number): Promise<Response[]>;
  createResponse(response: InsertResponse): Promise<Response>;
  updateResponse(id: number, response: Partial<Response>): Promise<Response | undefined>;
  deleteResponse(id: number): Promise<void>;
}

// Helper to ensure consistent Question object structure
function formatQuestion(q: Partial<Question>): Question {
  let options: any[] = [];
  if (Array.isArray(q.options)) {
    options = q.options;
  } else if (typeof q.options === 'string') {
    try {
      options = q.options ? JSON.parse(q.options) : [];
    } catch {
      options = [];
    }
  }
  let testCases: any[] = [];
  if (Array.isArray(q.testCases)) {
    testCases = q.testCases;
  } else if (typeof q.testCases === 'string') {
    try {
      testCases = q.testCases ? JSON.parse(q.testCases) : [];
    } catch {
      testCases = [];
    }
  }
  return {
    id: q.id!,
    interviewId: q.interviewId!,
    stage: q.stage ?? 1,
    type: q.type ?? 'mcq',
    question: q.question ?? '',
    options,
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
    testCases,
    aiGenerated: q.aiGenerated !== undefined ? q.aiGenerated : true,
    createdAt: q.createdAt!,
  };
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
    const now = new Date();
    const user: User = {
      ...insertUser,
      id,
      bio: insertUser.bio || null,
      profileImage: insertUser.profileImage || null,
      createdAt: now,
      lastSignIn: now,
    };
    this.users.set(id, user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    const user = this.users.get(id);
    if (!user) return undefined;
    const updatedUser = {
      ...user,
      ...updates,
      bio: updates.bio !== undefined ? updates.bio : user.bio,
      profileImage: updates.profileImage !== undefined ? updates.profileImage : user.profileImage,
      lastSignIn: updates.lastSignIn ? updates.lastSignIn : user.lastSignIn,
    };
    this.users.set(id, updatedUser);
    return updatedUser;
  }

  // Interview operations
  async getInterview(id: number): Promise<Interview | undefined> {
    const interview = this.interviews.get(id);
    if (!interview) return undefined;
    return {
      id: interview.id,
      userId: interview.userId,
      role: interview.role,
      experienceLevel: interview.experienceLevel,
      status: interview.status,
      currentStage: interview.currentStage,
      overallScore: interview.overallScore,
      feedback: interview.feedback,
      createdAt: interview.createdAt,
      completedAt: interview.completedAt,
      durationMinutes: interview.durationMinutes || 0,
    };
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
      durationMinutes: insertInterview.durationMinutes || 0,
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

  async deleteInterview(id: number): Promise<void> {
    this.interviews.delete(id);
  }

  // Question operations
  async getQuestion(id: number): Promise<Question | undefined> {
    return this.questions.get(id);
  }

  async getQuestionsByInterviewId(interviewId: number): Promise<Question[]> {
    return Array.from(this.questions.values())
      .filter(question => question.interviewId === interviewId)
      .map(formatQuestion);
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    const id = this.currentQuestionId++;
    const question: Question = {
      id,
      interviewId: insertQuestion.interviewId,
      stage: insertQuestion.stage,
      type: insertQuestion.type,
      question: insertQuestion.question,
      options: Array.isArray(insertQuestion.options) ? insertQuestion.options : [],
      correctAnswer: typeof insertQuestion.correctAnswer === 'string' ? insertQuestion.correctAnswer : '',
      testCases: Array.isArray(insertQuestion.testCases) ? insertQuestion.testCases : [],
      aiGenerated: insertQuestion.aiGenerated !== undefined ? insertQuestion.aiGenerated : true,
      createdAt: new Date(),
    };
    this.questions.set(id, question);
    return formatQuestion(question);
  }

  async deleteQuestion(id: number): Promise<void> {
    this.questions.delete(id);
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

  async deleteResponse(id: number): Promise<void> {
    this.responses.delete(id);
  }
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    console.log("DatabaseStorage.getUser:", { id, user });
    return user || undefined;
  }

  async getUserByFirebaseUid(firebaseUid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.firebaseUid, firebaseUid));
    console.log("DatabaseStorage.getUserByFirebaseUid:", { firebaseUid, user });
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    console.log("DatabaseStorage.getUserByEmail:", { email, user });
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    console.log("DatabaseStorage.createUser:", insertUser);
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    console.log("DatabaseStorage.createUser result:", user);
    return user;
  }

  async updateUser(id: number, updates: Partial<User>): Promise<User | undefined> {
    console.log("DatabaseStorage.updateUser:", { id, updates });
    try {
      const [user] = await db
        .update(users)
        .set(updates)
        .where(eq(users.id, id))
        .returning();
      console.log("DatabaseStorage.updateUser result:", user);
      return user || undefined;
    } catch (error) {
      console.error("DatabaseStorage.updateUser error:", error);
      throw error;
    }
  }

  async getInterview(id: number): Promise<Interview | undefined> {
    const [interview] = await db.select().from(interviews).where(eq(interviews.id, id));
    console.log("DatabaseStorage.getInterview:", { id, interview });
    if (!interview) return undefined;
    return {
      id: interview.id,
      userId: interview.userId,
      role: interview.role,
      experienceLevel: interview.experienceLevel,
      status: interview.status,
      currentStage: interview.currentStage,
      overallScore: interview.overallScore,
      feedback: interview.feedback,
      createdAt: interview.createdAt,
      completedAt: interview.completedAt,
      durationMinutes: interview.durationMinutes || 0,
    };
  }

  async getInterviewsByUserId(userId: number): Promise<Interview[]> {
    try {
      const result = await db.select().from(interviews).where(eq(interviews.userId, userId));
      console.log("DatabaseStorage.getInterviewsByUserId:", { userId, count: result.length, interviews: result });
      return result;
    } catch (error) {
      console.error("DatabaseStorage.getInterviewsByUserId error:", error);
      throw error;
    }
  }

  async createInterview(insertInterview: InsertInterview): Promise<Interview> {
    console.log("storage.createInterview payload.userId:", insertInterview.userId);
    const [interview] = await db
      .insert(interviews)
      .values(insertInterview)
      .returning();
    console.log("storage.createInterview inserted.userId:", interview.userId);
    return {
      ...interview,
      durationMinutes: interview.durationMinutes || 0,
    };
  }

  async updateInterview(id: number, updates: Partial<Interview>): Promise<Interview | undefined> {
    console.log("DatabaseStorage.updateInterview:", { id, updates });
    try {
      const [interview] = await db
        .update(interviews)
        .set(updates)
        .where(eq(interviews.id, id))
        .returning();
      console.log("DatabaseStorage.updateInterview result:", interview);
      if (!interview) return undefined;
      return {
        ...interview,
        durationMinutes: interview.durationMinutes || 0,
      };
    } catch (error) {
      console.error("DatabaseStorage.updateInterview error:", error);
      throw error;
    }
  }

  async deleteInterview(id: number): Promise<void> {
    await db.delete(interviews).where(eq(interviews.id, id));
  }

  async getQuestion(id: number): Promise<Question | undefined> {
    const [question] = await db.select().from(questions).where(eq(questions.id, id));
    console.log("DatabaseStorage.getQuestion:", { id, question });
    return question || undefined;
  }

  async getQuestionsByInterviewId(interviewId: number): Promise<Question[]> {
    try {
    const result = await db.select().from(questions).where(eq(questions.interviewId, interviewId));
    console.log("DatabaseStorage.getQuestionsByInterviewId:", { interviewId, count: result.length, questions: result });
    return result.map(q => ({
      id: q.id,
      interviewId: q.interviewId,
      stage: q.stage,
      type: q.type,
      question: q.question,
      options: q.options,
      correctAnswer: q.correctAnswer,
      testCases: q.testCases,
      aiGenerated: q.aiGenerated,
      createdAt: q.createdAt,
    }));
    } catch (error) {
      console.error("Error fetching questions for interview:", interviewId, error);
      // Return empty array if database error, allowing frontend to handle gracefully
      return [];
    }
  }

  async createQuestion(insertQuestion: InsertQuestion): Promise<Question> {
    try {
    console.log("DatabaseStorage.createQuestion:", insertQuestion);
    const [question] = await db
      .insert(questions)
      .values(insertQuestion)
      .returning();
    console.log("DatabaseStorage.createQuestion result:", question);
    return question;
    } catch (error) {
      console.error("Error creating question:", insertQuestion, error);
      throw new Error(`Failed to create question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteQuestion(id: number): Promise<void> {
    await db.delete(questions).where(eq(questions.id, id));
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

  async deleteResponse(id: number): Promise<void> {
    await db.delete(responses).where(eq(responses.id, id));
  }
}

// export const storage = new MemStorage();
export const storage = new DatabaseStorage();
