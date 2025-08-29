export interface Interview {
  id: number;
  userId: number;
  role: string;
  experienceLevel: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  currentStage: number;
  overallScore?: number;
  feedback?: any;
  createdAt: Date;
  completedAt?: Date;
  durationMinutes?: number;
}

export interface Question {
  id: number;
  interviewId: number;
  stage: number;
  type: 'mcq' | 'coding' | 'voice';
  question: string;
  options?: string[];
  correctAnswer?: string;
  testCases?: any[];
  aiGenerated: boolean;
  createdAt: Date;
}

export interface Response {
  id: number;
  questionId: number;
  interviewId: number;
  answer: string;
  audioUrl?: string;
  transcription?: string;
  isCorrect?: boolean;
  score?: number;
  feedback?: any;
  timeSpent?: number;
  createdAt: Date;
}

export interface InterviewFormData {
  role: string;
  experienceLevel: string;
}

export interface MCQQuestionData {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
}

export interface CodingQuestionData {
  title: string;
  description: string;
  difficulty: string;
  constraints: string[];
  examples: Array<{
    input: string;
    output: string;
    explanation?: string;
  }>;
  testCases: Array<{
    input: string;
    expectedOutput: string;
  }>;
}

export interface User {
  createdAt: Date;
  lastSignIn?: Date;
}
