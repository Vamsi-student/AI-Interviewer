import type { Express } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { verifyFirebaseToken } from "./services/firebase";
import {
  generateMCQQuestions,
  generateCodingQuestion,
  generateVoiceQuestion,
  evaluateMCQAnswer,
  evaluateVoiceResponse,
  generateInterviewFeedback,
  analyzeResumeWithGemini,
  generateFunctionSignature,
  generateJudge0ExecutableCode,
  generateFullCodeForTestCase,
  callGemini
} from "./services/gemini";
import { transcribeAudio } from "./services/whisper";
import axios from "axios";
import { db } from "./db";
import { problems, testCases } from "../shared/schema";
import { eq } from "drizzle-orm";
import { insertUserSchema, insertInterviewSchema, insertQuestionSchema, insertResponseSchema, users } from "@shared/schema";
import { questions } from "@shared/schema";
import { and } from "drizzle-orm";

// --- BEGIN: Input Preprocessing for Judge0 ---
function preprocessInput(rawInput: string): string {
  if (typeof rawInput !== 'string') return '';
  const lines = rawInput.trim().split('\n');
  let values: string[] = [];
  for (const line of lines) {
    if (line.includes('[') && line.includes(']')) {
      const match = line.match(/\[(.*?)\]/);
      if (match) {
        const flat = match[1].split(',').map(s => s.trim()).join(' ');
        values.push(flat);
      }
    } else if (line.includes('=')) {
      const eqIndex = line.indexOf('=');
      const val = line.slice(eqIndex + 1).trim();
      values.push(val.replace(/['"]/g, ''));
    } else {
      values.push(line.trim());
    }
  }
  return values.join('\n');
}
// --- END: Input Preprocessing for Judge0 ---

// Helper function to map language string to Judge0 numeric ID
function getLanguageId(language: string): number {
  const map: Record<string, number> = {
    'c': 50,
    'cpp': 54,
    'c++': 54,
    'python': 71,
    'python3': 71,
    'java': 62,
    'javascript': 63,
    'typescript': 74,
    'go': 60,
    'ruby': 72,
    'php': 68,
    'c#': 51,
    'cs': 51,
    'swift': 83,
    'kotlin': 78,
    'rust': 73,
    'scala': 81,
    'perl': 85,
    'r': 80,
    'dart': 94,
    'haskell': 61,
    'bash': 46,
    'shell': 46
  };
  return map[language.toLowerCase()] || 71; // default to Python 3
}

// Helper to remove Markdown code block markers and any lines starting with backticks before sending to Judge0 (works for all languages)
function stripMarkdownCodeBlocks(code: string): string {
  // Remove any line that starts with backticks (with or without spaces)
  return code
    .split(/\r?\n/)
    .filter(line => !/^\s*`+/.test(line))
    .join('\n')
    .trim();
}

// Helper to decode base64 output if needed (always tries to decode, falls back if not printable)
function decodeBase64IfNeeded(str: string, debug = false): string {
  if (!str) return '';
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    // If decoding produces mostly printable characters, use it
    if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(decoded) && decoded.length > 0) {
      if (debug) console.log('decodeBase64IfNeeded: Decoded value:', decoded);
      return decoded;
    }
    if (debug) console.warn('decodeBase64IfNeeded: Decoded string failed printable check:', decoded);
    return str;
  } catch (e) {
    if (debug) console.error('decodeBase64IfNeeded: Base64 decode error:', e);
    return str;
  }
}

// Helper to normalize output: trim, collapse spaces, remove extra newlines
function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Configure multer for file uploads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const storageConfig = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
      const timestamp = Date.now();
      cb(null, `audio_${timestamp}.wav`);
    }
  });

  const upload = multer({ 
    storage: storageConfig,
    limits: {
      fileSize: 10 * 1024 * 1024 // 10MB limit
    }
  });

  // Middleware to verify Firebase token
  const requireAuth = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const token = authHeader.substring(7);
      
      // Handle demo mode
      if (token === 'demo-token') {
        let user = await storage.getUserByFirebaseUid('demo-user-123');
        if (!user) {
          user = await storage.createUser({
            firebaseUid: 'demo-user-123',
            email: 'demo@example.com',
            name: 'Demo User'
          });
        }
        req.user = user;
        return next();
      }

      const decodedToken = await verifyFirebaseToken(token);
      
      // Get or create user
      let user = await storage.getUserByFirebaseUid(decodedToken.uid);
      if (!user) {
        user = await storage.createUser({
          firebaseUid: decodedToken.uid,
          email: decodedToken.email || '',
          name: decodedToken.name || decodedToken.email || 'User',
        });
      }
      
      req.user = user;
      next();
    } catch (error) {
      return res.status(401).json({ message: 'Invalid token' });
    }
  };

  // Auth routes
  app.post('/api/auth/verify', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      // Handle demo mode
      if (token === 'demo-token') {
        let user = await storage.getUserByFirebaseUid('demo-user-123');
        if (!user) {
          user = await storage.createUser({
            firebaseUid: 'demo-user-123',
            email: 'demo@example.com',
            name: 'Demo User'
          });
        }
        // Update lastSignIn for demo user
        user = await storage.updateUser(user.id, { lastSignIn: new Date() }) || user;
        return res.json({ user });
      }

      const decodedToken = await verifyFirebaseToken(token);
      let user = await storage.getUserByFirebaseUid(decodedToken.uid);
      
      if (!user) {
        user = await storage.createUser({
          firebaseUid: decodedToken.uid,
          email: decodedToken.email || '',
          name: decodedToken.name || decodedToken.email?.split('@')[0] || 'User'
        });
      }
      // Update lastSignIn for real user
      user = await storage.updateUser(user.id, { lastSignIn: new Date() }) || user;
      res.json({ user });
    } catch (error) {
      console.error('Auth verification error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Profile update route
  app.put('/api/profile', requireAuth, async (req: any, res) => {
    try {
      const { name, bio, profileImage } = req.body;
      console.log('Profile update request:', { userId: req.user.id, name, bio, profileImage });
      console.log('Current user object:', req.user);
      
      // Test with just name first
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (bio !== undefined) updateData.bio = bio;
      if (profileImage !== undefined) updateData.profileImage = profileImage;
      
      console.log('Update data:', updateData);
      
      // Update user profile
      const updatedUser = await storage.updateUser(req.user.id, updateData);

      console.log('Profile updated successfully:', updatedUser);
      res.json({ user: updatedUser });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ message: 'Failed to update profile', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Interview routes
  app.post('/api/interviews', requireAuth, async (req: any, res) => {
    try {
      const validated = insertInterviewSchema.parse({
        ...req.body,
        userId: req.user.id,
        currentStage: 1,
      });

      // Log and validate interview object
      console.log('Validated interview object:', validated);
      const interview = await storage.createInterview(validated);
      console.log('Created interview (full object):', interview);
      
      // Define isTechnical before using it
      const technicalRoles = ['software engineer', 'developer', 'data scientist', 'sre', 'devops'];
      const isTechnical = technicalRoles.some(role => 
        interview.role.toLowerCase().includes(role.toLowerCase())
      );

      // Generate MCQ and coding questions in parallel
      let mcqQuestions: any[] = [];
      let codingQuestion = null;
      try {
      const mcqPromise = generateMCQQuestions(interview.role, interview.experienceLevel, 5);
      const codingPromise = isTechnical
        ? generateCodingQuestion(interview.role, interview.experienceLevel)
        : Promise.resolve(null);
        [mcqQuestions, codingQuestion] = await Promise.all([
        mcqPromise,
        codingPromise
      ]);
      } catch (err) {
        console.error('Error generating questions:', err);
      }

      let createdQuestions = 0;
      // --- Handle MCQ Questions ---
      if (Array.isArray(mcqQuestions)) {
        for (const mcq of mcqQuestions) {
          if (mcq.question && Array.isArray(mcq.options) && mcq.options.length > 0) {
            await storage.createQuestion({
              interviewId: interview.id,
              stage: 1,
              type: 'mcq',
              question: mcq.question,
              options: mcq.options,
              correctAnswer: mcq.correctAnswer || '',
              aiGenerated: true,
              testCases: [],
            });
            createdQuestions++;
          } else {
            console.warn('Skipping invalid MCQ question:', mcq);
          }
        }
      } else {
        console.error('generateMCQQuestions did not return an array:', mcqQuestions);
      }

      // --- Handle Coding Question ---
      if (codingQuestion && codingQuestion.title && codingQuestion.description) {
        const codingObj = {
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify(codingQuestion),
          testCases: codingQuestion.testCases || [],
          aiGenerated: true,
          options: [],
          correctAnswer: '',
        };
        console.log('Saving coding question:', codingObj);
        await storage.createQuestion(codingObj);
        createdQuestions++;
      } else if (isTechnical) {
        console.error('Coding question missing required fields:', codingQuestion);
      }

      // --- Handle Voice Question for Non-Technical Roles ---
      if (!isTechnical) {
        // For non-technical roles, create the default voice question immediately
        const defaultVoiceQuestion = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 3,
          type: 'voice',
          question: defaultVoiceQuestion,
          aiGenerated: true,
          options: [],
          correctAnswer: '',
          testCases: [],
        });
        createdQuestions++;
        console.log('Created default voice question for non-technical role');
      }

      // --- Robustness: Only return interview if at least one question was created ---
      if (createdQuestions === 0) {
        // Delete the interview to avoid orphaned interviews
        if (interview && interview.id) {
          try { await storage.deleteInterview(interview.id); } catch (e) { console.error('Failed to delete orphaned interview:', e); }
        }
        return res.status(500).json({ message: 'Failed to generate questions for interview. Please try again.' });
      }

      res.json(interview);
    } catch (error) {
      console.error('Error creating interview:', error);
      res.status(400).json({ message: 'Failed to create interview' });
    }
  });

  // --- Regenerate questions for an existing interview ---
  app.post('/api/interviews/:id/regenerate-questions', requireAuth, async (req: any, res) => {
    try {
      const interviewId = parseInt(req.params.id);
      const interview = await storage.getInterview(interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      // Delete existing questions and their responses for this interview
      const existingQuestions = await storage.getQuestionsByInterviewId(interviewId);
      for (const q of existingQuestions) {
        try {
          // Delete all responses for this question
          const responses = await storage.getResponsesByQuestionId(q.id);
          for (const r of responses) {
            try { await storage.deleteResponse(r.id); } catch (e) { console.warn('Failed to delete old response:', e); }
          }
          await storage.deleteQuestion(q.id);
        } catch (e) { console.warn('Failed to delete old question or its responses:', e); }
      }
      // Generate new questions
      const technicalRoles = ['software engineer', 'developer', 'data scientist', 'sre', 'devops'];
      const isTechnical = technicalRoles.some(role => 
        interview.role.toLowerCase().includes(role.toLowerCase())
      );
      let mcqQuestions: any[] = [];
      let codingQuestion = null;
      try {
        const mcqPromise = generateMCQQuestions(interview.role, interview.experienceLevel, 5);
        const codingPromise = isTechnical
          ? generateCodingQuestion(interview.role, interview.experienceLevel)
          : Promise.resolve(null);
        [mcqQuestions, codingQuestion] = await Promise.all([
          mcqPromise,
          codingPromise
        ]);
      } catch (err) {
        console.error('Error generating questions:', err);
      }
      let createdQuestions = 0;
      const created: any[] = [];
      if (Array.isArray(mcqQuestions)) {
        for (const mcq of mcqQuestions) {
          if (mcq.question && Array.isArray(mcq.options) && mcq.options.length > 0) {
            const q = await storage.createQuestion({
              interviewId: interview.id,
              stage: 1,
              type: 'mcq',
              question: mcq.question,
              options: mcq.options,
              correctAnswer: mcq.correctAnswer || '',
              aiGenerated: true,
              testCases: [],
            });
            created.push(q);
            createdQuestions++;
          } else {
            console.warn('Skipping invalid MCQ question:', mcq);
          }
        }
      } else {
        console.error('generateMCQQuestions did not return an array:', mcqQuestions);
      }
      if (codingQuestion && codingQuestion.title && codingQuestion.description) {
        const codingObj = {
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify(codingQuestion),
          testCases: codingQuestion.testCases || [],
          aiGenerated: true,
          options: [],
          correctAnswer: '',
        };
        const q = await storage.createQuestion(codingObj);
        created.push(q);
        createdQuestions++;
      } else if (isTechnical) {
        console.error('Coding question missing required fields:', codingQuestion);
      }

      // --- Handle Voice Question for Non-Technical Roles ---
      if (!isTechnical) {
        // For non-technical roles, create the default voice question immediately
        const defaultVoiceQuestion = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
        const q = await storage.createQuestion({
          interviewId: interview.id,
          stage: 3,
          type: 'voice',
          question: defaultVoiceQuestion,
          aiGenerated: true,
          options: [],
          correctAnswer: '',
          testCases: [],
        });
        created.push(q);
        createdQuestions++;
        console.log('Created default voice question for non-technical role during regeneration');
      }

      if (createdQuestions === 0) {
        return res.status(500).json({ message: 'Failed to generate questions for interview. Please try again.' });
      }
      res.json({ questions: created });
    } catch (error) {
      console.error('Error regenerating questions:', error);
      res.status(500).json({ message: 'Failed to regenerate questions' });
    }
  });

  app.get('/api/interviews', requireAuth, async (req: any, res) => {
    try {
      const interviews = await storage.getInterviewsByUserId(req.user.id);
      res.json(interviews);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch interviews' });
    }
  });

  app.get('/api/interviews/:id', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      console.log('READ userId:', req.user.id, 'interview.userId:', interview?.userId, 'id:', req.params.id);
      
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      if (interview.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      // Ensure currentStage is set
      if (!interview.currentStage) {
        console.log("Interview missing currentStage, updating to 1:", interview.id);
        const updatedInterview = await storage.updateInterview(interview.id, { currentStage: 1 });
        res.json(updatedInterview);
      } else {
        res.json(interview);
      }
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch interview' });
    }
  });

  app.put('/api/interviews/:id', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      const updatedInterview = await storage.updateInterview(interview.id, req.body);
      res.json(updatedInterview);
    } catch (error) {
      res.status(500).json({ message: 'Failed to update interview' });
    }
  });

  // Question routes
  app.get('/api/interviews/:interviewId/questions', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.interviewId));
      
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      if (interview.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const questions = await storage.getQuestionsByInterviewId(interview.id);
      console.log('Fetched questions for interview', interview.id, ':', questions.map(q => ({ id: q.id, stage: q.stage, type: q.type })));
      res.json(questions);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch questions' });
    }
  });

  app.post('/api/interviews/:interviewId/voice-question', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.interviewId));
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      // Accept previous Q&A context from request body
      const previousQA = req.body.previousQA || [];
      const isRetry = req.body.retry || false;

      const existingQuestions = await storage.getQuestionsByInterviewId(interview.id);
      const voiceQuestions = existingQuestions
        .filter(q => q.stage === 3)
        .map(q => q.question);

      console.log('🎤 Voice question generation request:', {
        interviewId: interview.id,
        role: interview.role,
        experienceLevel: interview.experienceLevel,
        previousQACount: previousQA.length,
        existingVoiceQuestionsCount: voiceQuestions.length,
        isRetry,
        previousQA: previousQA.map((qa: any) => ({ q: qa.question.substring(0, 50) + '...', a: qa.answer.substring(0, 30) + '...' }))
      });

      let question;
      // If this is the first voice question, use a friendly intro
      if (previousQA.length === 0) {
        question = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
        console.log('🎤 Using first question template');
      } else {
        // Use previousQA for context-aware question generation
        try {
          if (isRetry) {
            // For retry requests, use a different approach to generate unique questions
            console.log('🔄 Retry request - generating alternative question');
            question = await generateVoiceQuestion(interview.role, interview.experienceLevel, voiceQuestions, previousQA, true);
          } else {
            question = await generateVoiceQuestion(interview.role, interview.experienceLevel, voiceQuestions, previousQA);
          }
          console.log('🎤 AI-generated question:', question.substring(0, 100) + '...');
        } catch (error) {
          console.error('Error generating voice question with AI, using fallback:', error);
          // Fallback question if AI generation fails
          if (isRetry) {
            question = `Based on your previous responses, what specific challenges have you faced in your ${interview.role} role?`;
          } else {
            question = `Thank you for that response. Could you tell me more about your experience with ${interview.role}?`;
          }
        }
      }
      
      const createdQuestion = await storage.createQuestion({
        interviewId: interview.id,
        stage: 3,
        type: 'voice',
        question,
        aiGenerated: true,
        options: [],
        correctAnswer: '',
        testCases: [],
      });

      console.log('Created voice question:', { id: createdQuestion.id, question: createdQuestion.question });

      res.json({ ...createdQuestion, audioText: null });
    } catch (error) {
      console.error('Error generating voice question:', error);
      res.status(500).json({ message: 'Failed to generate voice question' });
    }
  });

  // Response routes
  app.post('/api/responses', requireAuth, async (req: any, res) => {
    try {
      const { questionId, answer, audioBlob, evaluation: codingEvaluation } = req.body;
      
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }

      let interview = await storage.getInterview(question.interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      let transcription = '';
      let audioUrl = '';

      // Handle audio transcription for voice responses
      if (audioBlob && question.type === 'voice') {
        try {
          const audioBuffer = Buffer.from(audioBlob, 'base64');
          transcription = await transcribeAudio(audioBuffer);
          // In production, you would upload the audio to a storage service
          audioUrl = 'placeholder-audio-url';
        } catch (error) {
          console.error('Error transcribing audio:', error);
        }
      }

      const finalAnswer = transcription || answer;

      // Evaluate the response
      let evaluation: any = { score: 0, isCorrect: false, feedback: '' };
      let allTestsPassed = false;
      let testResults = [];
      let navigateToStage3 = false;

      if (question.type === 'mcq') {
        evaluation = await evaluateMCQAnswer(question.question, finalAnswer, question.correctAnswer || '');
        // Force MCQ to be 100 for correct, 0 for incorrect
        evaluation.score = evaluation.isCorrect ? 100 : 0;
      } else if (question.type === 'voice') {
        // If answer is empty or too short, set score to 0
        const minChar = 20;
        const minWords = 5;
        const wordCount = finalAnswer.trim().split(/\s+/).length;
        if (!finalAnswer || finalAnswer.trim().length < minChar || wordCount < minWords) {
          evaluation = {
            score: 0,
            isCorrect: false,
            feedback: 'Answer too short or not relevant.',
            suggestions: ['Please provide a more detailed and relevant answer.'],
          };
        } else {
          const voiceEval = await evaluateVoiceResponse(question.question, finalAnswer, interview.role);
          // Clamp score: if AI gives less than 40, force to 0
          evaluation = {
            ...voiceEval,
            score: voiceEval.score < 40 ? 0 : voiceEval.score,
          };
        }
      } else if (question.type === 'coding') {
        // The frontend calls /api/code/execute and passes the results in `codingEvaluation`.
        // We just need to format it for storage.
        const numPassed = codingEvaluation?.testCaseResults?.filter((tc: any) => tc.passed).length || 0;
        const total = codingEvaluation?.testCaseResults?.length || 0;
        const score = total > 0 ? Math.round((numPassed / total) * 100) : 0;
        const isCorrect = numPassed === total && total > 0;

        evaluation = {
          score,
          isCorrect,
          summary: `Coding test completed. Passed ${numPassed} out of ${total} test cases.`,
          // Pass through all evaluation details from the execution
          ...(codingEvaluation || {}),
        };

        // --- Backend logic to ensure progression to stage 3 ---
        if (interview.currentStage === 2) {
          interview = await storage.updateInterview(interview.id, { currentStage: 3 }) || interview;

          // Check if a stage 3 (voice) question already exists to prevent duplicates
          const existingQuestions = await storage.getQuestionsByInterviewId(interview.id);
          const hasVoiceQuestion = existingQuestions.some(q => q.stage === 3 && q.type === 'voice');

          if (!hasVoiceQuestion) {
            // Create the static introductory voice question to start Stage 3.
            const questionText = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
            await storage.createQuestion({
              interviewId: interview.id,
              stage: 3,
              type: 'voice',
              question: questionText,
              aiGenerated: true,
              options: [],
              correctAnswer: '',
              testCases: [],
            });
          }
          navigateToStage3 = true;
        }
      }

      const savedResponse = await storage.createResponse({
        questionId,
        interviewId: question.interviewId,
        answer: finalAnswer,
        audioUrl,
        transcription,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation,
      });

      // Always re-fetch the latest interview state
      const updatedInterviewState = await storage.getInterview(interview.id);

      res.json({
        success: true,
        response: savedResponse,
        interview: updatedInterviewState,
        navigateToStage3
      });
    } catch (error) {
      console.error('Error creating response:', error);
      res.status(500).json({ message: 'Failed to create response' });
    }
  });

  // --- Dynamic code execution with Gemini-generated harness ---
  app.post('/api/code/execute', requireAuth, async (req, res) => {
    console.log('--- /api/code/execute endpoint hit ---');
    try {
      const { userCode, interviewId, language } = req.body;
      console.log('Backend received userCode:', userCode);

      if (!userCode || !interviewId || !language) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Fetch the coding question for this interview
      const codingQArr = await db.select().from(questions)
        .where(and(eq(questions.interviewId, interviewId), eq(questions.type, 'coding'), eq(questions.stage, 2)))
        .limit(1);
      const codingQ = codingQArr[0];
      if (!codingQ) {
        console.error('No coding question found for interviewId:', interviewId, 'codingQArr:', codingQArr);
        return res.status(404).json({ message: 'Coding question not found' });
      }

      // Get test cases from the question's testCases field
      let testCasesList: any[] = [];
      if (Array.isArray(codingQ.testCases)) {
        testCasesList = codingQ.testCases;
      } else if (typeof codingQ.testCases === 'string' && codingQ.testCases !== null) {
        try {
          testCasesList = JSON.parse(codingQ.testCases);
        } catch {
          testCasesList = [];
        }
      }
      console.log('Fetched testCasesList:', testCasesList);
      if (!Array.isArray(testCasesList) || !testCasesList.length) {
        console.error('No test cases found for codingQ:', codingQ);
        return res.status(404).json({ message: 'No test cases found for this coding question' });
      }

      // Prepare test cases for Gemini
      const testCasesForGemini = testCasesList.map((tc: any) => ({
        input: tc.input,
        expectedOutput: tc.expectedOutput
      }));

      // For each test case, generate code and run in isolation
      const testCaseResults = [];
      for (let i = 0; i < testCasesForGemini.length; i++) {
        const testCase = testCasesForGemini[i];
        // Parse the coding question as JSON to extract only the problem description
        let problemDescription = '';
        try {
          const parsedQ = typeof codingQ.question === 'string' ? JSON.parse(codingQ.question) : codingQ.question;
          problemDescription = `${parsedQ.title}\n${parsedQ.description}\nConstraints: ${(parsedQ.constraints || []).join(' ')}`;
        } catch {
          problemDescription = typeof codingQ.question === 'string' ? codingQ.question : '';
        }
        // Log the userCode being passed to Gemini
        console.log('Gemini injecting main() into user code:', userCode);
        // Generate full code for this test case only, with input hardcoded
        const fullCode = await generateFullCodeForTestCase(
          problemDescription,
          userCode,
          language,
          testCase.input,
          testCase.expectedOutput
        );
        // Log the final code sent to Judge0
        console.log('Final code sent to Judge0:', fullCode);
        // Backend check: If Gemini generates code for multiple test cases, reject it
        // --- FIX: Only check the main/harness code, not the user function ---
        // Split the code into user function and main/harness
        let userFunctionPart = '';
        let mainHarnessPart = '';
        // Simple split: assume user function comes before 'int main' or 'void main'
        const mainMatch = fullCode.match(/(int|void)\s+main\s*\(/);
        if (mainMatch) {
          const idx = fullCode.indexOf(mainMatch[0]);
          userFunctionPart = fullCode.slice(0, idx);
          mainHarnessPart = fullCode.slice(idx);
        } else {
          // fallback: treat all as main/harness if no main found
          mainHarnessPart = fullCode;
        }
        // Only check the main/harness for forbidden patterns
        if (/for\s*\(.*testCases|while\s*\(.*testCases|forEach\s*\(.*testCases|testCases\s*=|for\s*\(.*\[.*\].*\)/i.test(mainHarnessPart)) {
          console.warn('Gemini generated main/harness code that appears to handle multiple test cases. Rejecting. Code:', mainHarnessPart);
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            actualOutput: '',
            passed: false,
            error: 'Gemini generated main/harness code that appears to handle multiple test cases. Please try again.'
          });
          continue;
        }
        // Always clean code for all languages before sending to Judge0
        const cleanedCode = stripMarkdownCodeBlocks(fullCode);
        if (!cleanedCode.trim()) {
          console.error('Generated code is empty after stripping Markdown code blocks!');
        }
        console.log(`--- Executing test case ${i + 1} ---`);
        console.log('Generated code for Judge0:\n', cleanedCode);
        const base64Source = Buffer.from(cleanedCode).toString('base64');
        const languageId = getLanguageId(language); // Use numeric ID for Judge0
        try {
          const judge0Resp = await axios.post('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true', {
            source_code: base64Source,
            language_id: languageId, // Use the mapped numeric ID
            stdin: '', // Input is hardcoded in code
          }, {
            headers: {
              'X-RapidAPI-Key': process.env.JUDGE0_API_KEY || '',
              'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
              'Content-Type': 'application/json',
            }
          });
          // --- LOGGING: Judge0 response ---
          console.log('Judge0 response:', judge0Resp.data);
          const { stdout, stderr, compile_output, status } = judge0Resp.data;
          // If there is a compile_output, decode and print it for easier debugging
          if (compile_output) {
            try {
              const decodedCompileOutput = decodeBase64IfNeeded(compile_output).trim();
              console.log('Decoded compile_output:', decodedCompileOutput);
            } catch (e) {
              console.log('Could not decode compile_output:', compile_output);
            }
          }
          // --- DEBUGGING: Trace Judge0 output decoding ---
          console.log('DEBUG: Judge0 Raw stdout from response.data:', stdout);
          console.log('DEBUG: Destructured stdout variable (value before decode call):', stdout);
          const decodedStdoutDirectly = decodeBase64IfNeeded(stdout, true); // Pass true for debug logs inside the function
          console.log('DEBUG: Result of decodeBase64IfNeeded(stdout) directly:', decodedStdoutDirectly);
          const actualOutputRaw = stdout ? decodeBase64IfNeeded(stdout, true).trim() : '';
          console.log('DEBUG: Value of actualOutputRaw after assignment:', actualOutputRaw);
          const actualOutput = normalize(actualOutputRaw);
          console.log('DEBUG: Value of actualOutput after normalization:', actualOutput);
          const expectedOutputRaw = testCase.expectedOutput.trim();
          // Normalize outputs: trim, collapse spaces, remove extra newlines
          const expectedOutput = normalize(expectedOutputRaw);
          const passed = actualOutput === expectedOutput;
          // --- LOGGING: Output comparison ---
          console.log('Expected Output (raw):', expectedOutputRaw);
          console.log('Actual Output (decoded):', actualOutputRaw); // Only log the decoded output
          if (compile_output) {
            try {
              const decodedCompileOutput = decodeBase64IfNeeded(compile_output).trim();
              console.log('Decoded compile_output:', decodedCompileOutput);
            } catch (e) {
              console.log('Could not decode compile_output:', compile_output);
            }
          }
          console.log('Normalized Expected:', expectedOutput);
          console.log('Normalized Actual:', actualOutput);
          console.log('Comparison:', passed ? 'PASSED' : 'FAILED');
          if (!passed) console.log('Diff:', `Expected: '${expectedOutput}', Got: '${actualOutput}'`);
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: expectedOutputRaw,
            actualOutput: actualOutputRaw,
            userOutput: actualOutputRaw,
            normalizedExpected: expectedOutput,
            normalizedActual: actualOutput,
            passed,
            stderr,
            compile_output,
            status,
            runtimeMs: judge0Resp.data.time ? Math.round(parseFloat(judge0Resp.data.time) * 1000) : 0,
            diff: passed ? '' : `Expected: '${expectedOutput}', Got: '${actualOutput}'`
          });
        } catch (err) {
          console.error('Error in Judge0 or code comparison:', err);
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expectedOutput,
            actualOutput: '',
            passed: false,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
      res.json({
        success: true,
        testCaseResults,
      });
    } catch (error) {
      console.error('Error in /api/code/execute:', error);
      res.status(500).json({ message: 'Failed to execute code' });
    }
  });



  // Interview completion and feedback
  app.post('/api/interviews/:id/complete', requireAuth, async (req: any, res) => {
    try {
      console.log('Interview completion requested for ID:', req.params.id);
      const interview = await storage.getInterview(parseInt(req.params.id));
      console.log('Found interview:', interview);
      
      if (!interview || interview.userId !== req.user.id) {
        console.log('Interview not found or unauthorized');
        return res.status(404).json({ message: 'Interview not found' });
      }

      const responses = await storage.getResponsesByInterviewId(interview.id);
      console.log('Found responses:', responses.length);

      // Attach question type to responses for feedback generation
      const responsesWithQuestionType = await Promise.all(responses.map(async (response) => {
        const question = await storage.getQuestion(response.questionId);
        return {
          ...response,
          type: question?.type || 'unknown', // Default to 'unknown' if question not found
        };
      }));

      const rawFeedback = await generateInterviewFeedback(responsesWithQuestionType, interview.role, interview.experienceLevel);
      console.log('Generated feedback:', rawFeedback);

      // Sanitize the feedback from the AI to ensure required fields and types are correct.
      const overallScore = (rawFeedback && typeof rawFeedback.overallScore === 'number') ? rawFeedback.overallScore : 0;
      const feedback = {
        ...rawFeedback,
        overallScore, // Ensure the score in the feedback object is also the validated number
        strengths: rawFeedback?.strengths || [],
        weaknesses: rawFeedback?.weaknesses || [],
        recommendations: rawFeedback?.recommendations || [],
      };

      const updatedInterview = await storage.updateInterview(interview.id, {
        status: 'completed',
        completedAt: new Date(),
        overallScore: overallScore,
        feedback: feedback, // Save the sanitized feedback object
      });
      console.log('Updated interview:', updatedInterview);

      res.json(updatedInterview);
    } catch (error) {
      console.error('Error completing interview:', error);
      res.status(500).json({ message: 'Failed to complete interview' });
    }
  });

  app.get('/api/interviews/:id/responses', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      if (interview.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }

      const responses = await storage.getResponsesByInterviewId(interview.id);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch responses' });
    }
  });

  // Dedicated transcription endpoint
  app.post('/api/transcribe', requireAuth, upload.single('audio'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No audio file provided' });
      }

      console.log('🎤 Audio file received:', req.file.filename);
      console.log('📁 Audio file path:', req.file.path);
      
      // Transcribe using our Whisper service with the existing file path
      const transcript = await transcribeAudio(req.file.path);
      
      console.log('✅ Transcription completed:', transcript.substring(0, 100) + '...');
      
      res.json({ 
        success: true, 
        transcript: transcript.trim(),
        message: 'Audio transcribed successfully'
      });
      
    } catch (error) {
      console.error('❌ Transcription error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to transcribe audio',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // --- Generate function signature for coding problem (Gemini) ---
  app.post('/api/generate-signature', requireAuth, async (req, res) => {
    try {
      const { problemDescription, language } = req.body;
      if (!problemDescription || !language) {
        return res.status(400).json({ error: 'Missing problemDescription or language' });
      }
      const signature = await generateFunctionSignature(problemDescription, language);
      res.json({ signature });
    } catch (error) {
      console.error('Error generating function signature:', error);
      res.status(500).json({ error: 'Failed to generate function signature' });
    }
  });

  // Database schema check endpoint
  app.get('/api/debug/schema', async (req, res) => {
    try {
      // Try to query the users table with the new fields
      const testUser = await db.select().from(users).limit(1);
      console.log('Schema test - users table structure:', testUser);
      res.json({ 
        message: 'Database schema check', 
        userFields: testUser.length > 0 ? Object.keys(testUser[0]) : [],
        hasBio: testUser.length > 0 ? 'bio' in testUser[0] : false,
        hasProfileImage: testUser.length > 0 ? 'profileImage' in testUser[0] : false
      });
    } catch (error) {
      console.error('Schema check error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  // Debug endpoint to check user structure
  app.get('/api/debug/user/:id', requireAuth, async (req: any, res) => {
    try {
      const user = await storage.getUser(parseInt(req.params.id));
      console.log('Debug user structure:', user);
      res.json({ user, schema: 'bio and profileImage fields should be present' });
    } catch (error) {
      console.error('Debug user error:', error);
      res.status(500).json({ error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
