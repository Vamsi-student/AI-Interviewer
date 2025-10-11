import type { Express } from "express";
import { createServer, type Server } from "node:http";
import multer from "multer";
import path from "path";
import fs from "fs";
import { storage } from "./storage";
import { verifyFirebaseToken } from "./services/firebase";
import {
  generateMCQQuestions,
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
import { problems, testCases, codingProblems } from "../shared/schema";
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

// Helper function to map experience level to database difficulty
function mapExperienceToDifficulty(experienceLevel: string): string {
  const expLevel = experienceLevel.toLowerCase();
  console.log('Mapping experience level:', experienceLevel, 'to lowercase:', expLevel);
  if (expLevel.includes('beginner') || expLevel.includes('entry') || expLevel.includes('junior')) {
    console.log('Mapped to Easy');
    return 'Easy';
  } else if (expLevel.includes('senior') || expLevel.includes('expert') || expLevel.includes('lead')) {
    console.log('Mapped to Hard');
    return 'Hard';
  } else {
    console.log('Mapped to Medium (default)');
    return 'Medium'; // Default for mid-level, intermediate, etc.
  }
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
          name: decodedToken.name || 'User',
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

      // Generate new questions
      let mcqQuestions: any[] = [];
      let codingProblem = null;
      try {
        const mcqPromise = generateMCQQuestions(interview.role, interview.experienceLevel, 5);
        
        // Fetch coding problem from database for all roles
        const codingProblemPromise = (async () => {
          // Convert experience level to database difficulty format
          const dbExperienceLevel = mapExperienceToDifficulty(interview.experienceLevel);
          
          console.log(`Mapping experience level "${interview.experienceLevel}" to difficulty "${dbExperienceLevel}"`);
          
          const problems = await db.select().from(codingProblems)
            .where(eq(codingProblems.problemHardnessLevel, dbExperienceLevel))
            .limit(5);
          
          console.log(`Found ${problems.length} coding problems for difficulty level "${dbExperienceLevel}"`);
          console.log('Sample problems:', problems.slice(0, 2));
          
          if (problems.length === 0) {
            // Fallback to any available problem if no match found
            console.log('No problems found for difficulty level, falling back to any available problems');
            const fallbackProblems = await db.select().from(codingProblems).limit(5);
            console.log(`Found ${fallbackProblems.length} fallback coding problems`);
            console.log('Sample fallback problems:', fallbackProblems.slice(0, 2));
            return fallbackProblems.length > 0 ? fallbackProblems[Math.floor(Math.random() * fallbackProblems.length)] : null;
          }
          
          // Select a random problem from the matching hardness level
          const selectedProblem = problems[Math.floor(Math.random() * problems.length)];
          console.log('Selected coding problem:', selectedProblem.problemTitle);
          return selectedProblem;
        })();
        
        [mcqQuestions, codingProblem] = await Promise.all([
          mcqPromise,
          codingProblemPromise
        ]);
        
        console.log('Resolved mcqQuestions:', Array.isArray(mcqQuestions) ? mcqQuestions.length : 'Not an array');
        console.log('Resolved codingProblem:', codingProblem);
        console.log('Coding problem type:', typeof codingProblem);
        if (codingProblem && typeof codingProblem === 'object') {
          console.log('Coding problem keys:', Object.keys(codingProblem));
        }
      } catch (err) {
        console.error('Error generating questions or fetching coding problems:', err);
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

      // --- Handle Coding Problem from Database ---
      console.log('Checking coding problem for saving:', {
        codingProblem: codingProblem,
        hasProblem: !!codingProblem,
        hasTitle: codingProblem && codingProblem.problemTitle,
        hasDescription: codingProblem && codingProblem.problemDescription,
        title: codingProblem?.problemTitle,
        description: codingProblem?.problemDescription
      });
      
      if (codingProblem && codingProblem.problemTitle && codingProblem.problemDescription) {
        const codingObj = {
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify({
            title: codingProblem.problemTitle,
            description: codingProblem.problemDescription,
            constraints: codingProblem.constraints,
            examples: codingProblem.examples,
            problemId: codingProblem.id // Store reference to the coding problem
          }),
          testCases: codingProblem.testCases || [],
          aiGenerated: false, // This is from database, not AI generated
          options: [],
          correctAnswer: '',
        };
        console.log('Saving coding problem from database:', codingObj);
        await storage.createQuestion(codingObj);
        createdQuestions++;
        console.log('Successfully saved coding problem');
      } else {
        console.error('No suitable coding problem found in database for experience level:', interview.experienceLevel);
        console.error('Coding problem object:', codingProblem);
        if (codingProblem) {
          console.error('Coding problem keys:', Object.keys(codingProblem));
        }
      }

      // --- Voice questions will be created on-demand when user reaches stage 3 ---
      // Removed duplicate welcome question creation to prevent multiple instances

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
      let mcqQuestions: any[] = [];
      let codingProblem = null;
      try {
        const mcqPromise = generateMCQQuestions(interview.role, interview.experienceLevel, 5);
        
        // Fetch coding problem from database for all roles
        const codingProblemPromise = (async () => {
          // Convert experience level to database difficulty format
          const dbExperienceLevel = mapExperienceToDifficulty(interview.experienceLevel);
          
          console.log(`Mapping experience level "${interview.experienceLevel}" to difficulty "${dbExperienceLevel}"`);
          
          const problems = await db.select().from(codingProblems)
            .where(eq(codingProblems.problemHardnessLevel, dbExperienceLevel))
            .limit(5);
          
          console.log(`Found ${problems.length} coding problems for difficulty level "${dbExperienceLevel}"`);
          
          if (problems.length === 0) {
            // Fallback to any available problem if no match found
            console.log('No problems found for difficulty level, falling back to any available problems');
            const fallbackProblems = await db.select().from(codingProblems).limit(5);
            console.log(`Found ${fallbackProblems.length} fallback coding problems`);
            return fallbackProblems.length > 0 ? fallbackProblems[Math.floor(Math.random() * fallbackProblems.length)] : null;
          }
          
          // Select a random problem from the matching hardness level
          const selectedProblem = problems[Math.floor(Math.random() * problems.length)];
          console.log('Selected coding problem:', selectedProblem.problemTitle);
          return selectedProblem;
        })();
        
        [mcqQuestions, codingProblem] = await Promise.all([
          mcqPromise,
          codingProblemPromise
        ]);
        
        // Wait for the coding problem to resolve
        codingProblem = await codingProblemPromise;
      } catch (err) {
        console.error('Error generating questions or fetching coding problems:', err);
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
      if (codingProblem && codingProblem.problemTitle && codingProblem.problemDescription) {
        const codingObj = {
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify({
            title: codingProblem.problemTitle,
            description: codingProblem.problemDescription,
            constraints: codingProblem.constraints,
            examples: codingProblem.examples,
            problemId: codingProblem.id // Store reference to the coding problem
          }),
          testCases: codingProblem.testCases || [],
          aiGenerated: false, // This is from database, not AI generated
          options: [],
          correctAnswer: '',
        };
        const q = await storage.createQuestion(codingObj);
        created.push(q);
        createdQuestions++;
        console.log('Successfully saved coding problem (regeneration)');
      } else {
        console.error('No suitable coding problem found in database for experience level (regeneration):', interview.experienceLevel);
        console.error('Coding problem object (regeneration):', codingProblem);
        if (codingProblem) {
          console.error('Coding problem keys (regeneration):', Object.keys(codingProblem));
        }
      }

      // --- Voice questions will be created on-demand when user reaches stage 3 ---
      // Removed duplicate welcome question creation during regeneration

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

  // Coding Problems routes - fetch problems from database
  app.get('/api/coding-problems', requireAuth, async (req: any, res) => {
    try {
      const { hardnessLevel } = req.query;
      console.log('Fetching coding problems with hardness level:', hardnessLevel);
      
      let problems;
      
      // Filter by hardness level if provided
      if (hardnessLevel) {
        problems = await db.select().from(codingProblems)
          .where(eq(codingProblems.problemHardnessLevel, hardnessLevel as string))
          .limit(10); // Limit to 10 problems
      } else {
        problems = await db.select().from(codingProblems).limit(10);
      }
      
      console.log('Found coding problems:', problems.length);
      
      res.json(problems);
    } catch (error) {
      console.error('Error fetching coding problems:', error);
      res.status(500).json({ message: 'Failed to fetch coding problems' });
    }
  });

  app.get('/api/coding-problems/:id', requireAuth, async (req: any, res) => {
    try {
      const problemId = parseInt(req.params.id);
      const problem = await db.select().from(codingProblems)
        .where(eq(codingProblems.id, problemId))
        .limit(1);
      
      if (problem.length === 0) {
        return res.status(404).json({ message: 'Coding problem not found' });
      }
      
      console.log('Fetched coding problem:', problem[0].problemTitle);
      res.json(problem[0]);
    } catch (error) {
      console.error('Error fetching coding problem:', error);
      res.status(500).json({ message: 'Failed to fetch coding problem' });
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

  // Fix broken MCQ questions endpoint
  app.post('/api/questions/:questionId/fix', requireAuth, async (req: any, res) => {
    try {
      const questionId = parseInt(req.params.questionId);
      const question = await storage.getQuestion(questionId);
      
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }
      
      const interview = await storage.getInterview(question.interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      // Check if this is a broken code question
      const mentionsCode = /code snippet|following code|python code|javascript code|java code|c\+\+ code|consider.*code/i.test(question.question);
      const hasVisibleCode = /```|`\w+`|def |function |class |import |#include/.test(question.question);
      
      if (mentionsCode && !hasVisibleCode) {
        console.log('🔧 Fixing broken MCQ question:', question.id);
        
        // Generate a new question to replace this one
        const newQuestions = await generateMCQQuestions(interview.role, interview.experienceLevel, 1);
        
        if (newQuestions && newQuestions.length > 0) {
          const newQuestion = newQuestions[0];
          
          // Delete the old question and create a new one
          await storage.deleteQuestion(questionId);
          const createdQuestion = await storage.createQuestion({
            interviewId: interview.id,
            stage: 1,
            type: 'mcq',
            question: newQuestion.question,
            options: newQuestion.options,
            correctAnswer: newQuestion.correctAnswer || '',
            aiGenerated: true,
            testCases: [],
          });
          
          console.log('✅ Successfully fixed question:', questionId, '->', createdQuestion.id);
          return res.json({ 
            message: 'Question fixed successfully', 
            question: createdQuestion,
            wasFixed: true
          });
        }
      }
      
      res.json({ 
        message: 'Question does not need fixing', 
        question: question,
        wasFixed: false
      });
    } catch (error) {
      console.error('Error fixing question:', error);
      res.status(500).json({ message: 'Failed to fix question' });
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
      const isWelcomeQuestion = req.body.isWelcomeQuestion || false;

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
        isWelcomeQuestion,
        previousQA: previousQA.map((qa: any) => ({ q: qa.question.substring(0, 50) + '...', a: qa.answer.substring(0, 30) + '...' }))
      });

      // Enhanced duplicate prevention - check if welcome question already exists
      const welcomeQuestionExists = voiceQuestions.some(q => 
        q.toLowerCase().includes('welcome') && q.toLowerCase().includes('introduce yourself')
      );
      
      // If this is a request for a welcome question but one already exists, return conflict
      if (isWelcomeQuestion && welcomeQuestionExists) {
        console.log('⚠️ Welcome question already exists, returning conflict');
        // Return the existing welcome question
        const existingWelcomeQuestion = existingQuestions.find(q => 
          q.stage === 3 && 
          q.question.toLowerCase().includes('welcome') && 
          q.question.toLowerCase().includes('introduce yourself')
        );
        if (existingWelcomeQuestion) {
          return res.status(200).json(existingWelcomeQuestion);
        }
        // If we can't find it for some reason, return conflict
        return res.status(409).json({ message: 'Welcome question already exists' });
      }

      let question;
      // If this is the first voice question and no welcome question exists, use friendly intro
      if (previousQA.length === 0 && !welcomeQuestionExists) {
        question = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
        console.log('🎤 Using first question template');
      } else if (previousQA.length === 0 && welcomeQuestionExists) {
        // If welcome question already exists, generate a different first question
        console.log('⚠️ Welcome question already exists, generating alternative first question');
        question = `Thank you for joining the interview today. Could you start by telling me about your most recent professional experience?`;
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
      const { questionId, answer, audioBlob, codingEvaluation } = req.body;
      
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
            isCorrect: voiceEval.score >= 60, // Consider correct if score is 60 or above
            score: voiceEval.score < 40 ? 0 : voiceEval.score,
          };
        }
      } else if (question.type === 'coding') {
        // The frontend calls /api/code/execute and passes the results in `codingEvaluation`.
        // We just need to format it for storage.
        console.log('🔢 Processing coding evaluation:', {
          hasCodingEvaluation: !!codingEvaluation,
          testCaseResults: codingEvaluation?.testCaseResults?.length || 0,
          codingEvaluationKeys: Object.keys(codingEvaluation || {})
        });
        
        const numPassed = codingEvaluation?.testCaseResults?.filter((tc: any) => tc.passed).length || 0;
        const total = codingEvaluation?.testCaseResults?.length || 0;
        const score = total > 0 ? Math.round((numPassed / total) * 100) : 0;
        const isCorrect = numPassed === total && total > 0;
        
        console.log('📊 Coding score calculation:', {
          numPassed,
          total,
          score,
          isCorrect
        });

        evaluation = {
          score,
          isCorrect,
          summary: `Coding test completed. Passed ${numPassed} out of ${total} test cases.`,
          // Pass through all evaluation details from the execution
          ...(codingEvaluation || {}),
        };

        // --- Backend logic to ensure progression to stage 3 ---
        if (interview.currentStage === 2) {
          console.log('🔄 Stage progression: updating interview from stage 2 to stage 3');
          
          interview = await storage.updateInterview(interview.id, { currentStage: 3 }) || interview;
          console.log('✅ Interview stage updated to 3');

          // Enhanced duplicate prevention - check for any existing voice questions
          const existingQuestions = await storage.getQuestionsByInterviewId(interview.id);
          const existingVoiceQuestions = existingQuestions.filter(q => q.stage === 3 && q.type === 'voice');
          
          console.log('🔍 Stage 3 transition check:', {
            interviewId: interview.id,
            existingVoiceQuestions: existingVoiceQuestions.length,
            questionIds: existingVoiceQuestions.map(q => q.id)
          });

          // Only create welcome question if absolutely no voice questions exist
          if (existingVoiceQuestions.length === 0) {
            console.log('🎤 Creating initial voice question for stage 3 transition');
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
            console.log('✅ Voice welcome question created successfully');
          } else {
            console.log('⚠️ Skipping voice question creation - questions already exist');
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
      
      console.log('✅ Response saved successfully:', {
        responseId: savedResponse.id,
        questionType: question.type,
        score: savedResponse.score,
        isCorrect: savedResponse.isCorrect,
        feedbackKeys: Object.keys(savedResponse.feedback || {})
      });

      // Always re-fetch the latest interview state
      const updatedInterviewState = await storage.getInterview(interview.id);
      
      console.log('📊 Response endpoint summary:', {
        questionType: question.type,
        originalStage: interview.currentStage,
        updatedStage: updatedInterviewState?.currentStage,
        navigateToStage3,
        responseId: savedResponse.id
      });

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

  // --- Enhanced code execution with database test runners ---
  app.post('/api/code/execute', requireAuth, async (req, res) => {
    console.log('--- /api/code/execute endpoint hit ---');
    try {
      const { userCode, interviewId, language } = req.body;
      console.log('Backend received userCode:', userCode);

      if (!userCode || !interviewId || !language) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      // Helper functions for validation
      const extractFunctionNames = (code: string): string[] => {
        const functionRegex = /(?:function\s+|def\s+|public\s+\w+\s+|private\s+\w+\s+|\w+\s+)(\w+)\s*\(/g;
        const matches = [];
        let match;
        while ((match = functionRegex.exec(code)) !== null) {
          matches.push(match[1]);
        }
        return matches;
      };
      
      const extractFunctionCalls = (code: string): string[] => {
        const callRegex = /(\w+)\s*\(/g;
        const matches = [];
        let match;
        while ((match = callRegex.exec(code)) !== null) {
          matches.push(match[1]);
        }
        return matches;
      };

      // Fetch the coding question for this interview
      const codingQArr = await db.select().from(questions)
        .where(and(eq(questions.interviewId, interviewId), eq(questions.type, 'coding'), eq(questions.stage, 2)))
        .limit(1);
      const codingQ = codingQArr[0];
      if (!codingQ) {
        console.error('No coding question found for interviewId:', interviewId, 'codingQArr:', codingQArr);
        return res.status(404).json({ message: 'Coding question not found' });
      }

      // Parse the question to get the problemId
      let problemId = null;
      try {
        const parsedQuestion = typeof codingQ.question === 'string' ? JSON.parse(codingQ.question) : codingQ.question;
        problemId = parsedQuestion.problemId;
      } catch (err) {
        console.error('Failed to parse question for problemId:', err);
      }

      // If we have a problemId, fetch the coding problem from database
      let codingProblem = null;
      if (problemId) {
        const problemArr = await db.select().from(codingProblems)
          .where(eq(codingProblems.id, problemId))
          .limit(1);
        codingProblem = problemArr[0];
        
        if (codingProblem) {
          console.log('✅ Found matching coding problem:', codingProblem.problemTitle);
          console.log('🔍 DEBUG - Full coding problem object keys:', Object.keys(codingProblem));
          console.log('🔍 DEBUG - testRunners field exists:', 'testRunners' in codingProblem);
          console.log('🔍 DEBUG - test_runners field exists:', 'test_runners' in codingProblem);
          console.log('🔍 DEBUG - testRunners value:', codingProblem.testRunners);
          console.log('🔍 DEBUG - test_runners value:', (codingProblem as any).test_runners);
        } else {
          console.warn('⚠️ problemId exists but no matching problem found in database:', problemId);
        }
      } else {
        console.log('ℹ️ No problemId found, this is a LEGACY AI-generated question without database problem reference');
        console.log('🔄 To use database test runners, create a new interview instead of using this legacy question');
      }

      // Get test cases - prioritize database problem, fallback to question's testCases
      let testCasesList: any[] = [];
      if (codingProblem && codingProblem.testCases) {
        testCasesList = Array.isArray(codingProblem.testCases) ? codingProblem.testCases : JSON.parse(codingProblem.testCases as string);
      } else if (Array.isArray(codingQ.testCases)) {
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

      // Get test runners from database (PRIORITY: Use database test runners)
      let testRunners = null;
      if (codingProblem && codingProblem.testRunners) {
        testRunners = typeof codingProblem.testRunners === 'string' 
          ? JSON.parse(codingProblem.testRunners) 
          : codingProblem.testRunners;
        console.log('📋 Test runners structure:', Object.keys(testRunners || {}));
        console.log('🔍 Available languages in test runners:', Object.keys(testRunners || {}));
        console.log('🎯 Problem with test runners:', codingProblem.problemTitle);
      } else if (codingProblem) {
        console.log('⚠️ Problem found but no test runners available:', codingProblem.problemTitle);
      } else {
        console.log('ℹ️ No coding problem found, will use AI fallback for all test cases');
      }

      // Execute test cases using database test runners (one test runner per test case)
      const testCaseResults = [];
      
      console.log(`\n🚀 Starting execution for ${testCasesList.length} test cases in ${language}`);
      console.log('👤 User code preview:', userCode.substring(0, 200) + '...');
      
      // Process each test case individually with its specific test runner
      for (let i = 0; i < testCasesList.length; i++) {
        const testCase = testCasesList[i];
        const testCaseId = i + 1; // 1-based test case ID
        
        console.log(`\n=== 🧪 Processing Test Case ${testCaseId} ===`);
        console.log('📥 Input:', testCase.input);
        console.log('🎯 Expected Output:', testCase.expected_output || testCase.expectedOutput);
        
        let fullCode = '';
        let testRunnerFound = false;
        
        try {
          // PRIORITY 1: Use database test runners (YOUR PREFERRED APPROACH)
          // Your database structure: testRunners[language] = [
          //   {test_case_id: 1, input: "[2,7,11,15]\n9", code: "int main(){...}"},
          //   {test_case_id: 2, input: "[3,2,4]\n6", code: "int main(){...}"}
          // ]
          if (testRunners && testRunners[language]) {
            const languageRunners = testRunners[language];
            
            console.log('🔍 Debug - Test runner structure for language:', language);
            console.log('  Type:', typeof languageRunners);
            console.log('  Is Array:', Array.isArray(languageRunners));
            console.log('  Length:', Array.isArray(languageRunners) ? languageRunners.length : 'Not an array');
            console.log('  Looking for test_case_id:', testCaseId);
            
            let testRunnerTemplate = null;
            
            // Your database format: Array of objects with test_case_id, input, code
            if (Array.isArray(languageRunners)) {
              const specificRunner = languageRunners.find(runner => 
                runner.test_case_id === testCaseId || runner.test_case_id === testCaseId.toString()
              );
              
              if (specificRunner && specificRunner.code) {
                testRunnerTemplate = specificRunner.code;
                console.log('✅ Found database test runner for test case', testCaseId);
                console.log('🔧 Test runner preview:', testRunnerTemplate.substring(0, 100) + '...');
                
                // Ensure template is a string (it should be from your database)
                if (typeof testRunnerTemplate !== 'string') {
                  console.warn('⚠️ Test runner template is not a string, converting:', typeof testRunnerTemplate);
                  testRunnerTemplate = String(testRunnerTemplate || '');
                }
                
                // Your database test runners are complete wrapper programs
                // They include the complete main function with test data
                // User code should be prepended before the main function
                fullCode = `${userCode}\n\n${testRunnerTemplate}`;
                
                testRunnerFound = true;
                console.log('✅ Successfully combined user code with database test runner for test case', testCaseId);
              } else {
                console.log('❌ No test runner found for test_case_id:', testCaseId);
                console.log('Available test_case_ids:', languageRunners.map(r => r.test_case_id));
              }
            } else {
              console.log('❌ Expected test runners to be an array but got:', typeof languageRunners);
            }
          }
          
          if (!testRunnerFound) {
            console.log('❌ No database test runner found for test case', testCaseId, 'language:', language);
          }
        } catch (testRunnerError) {
          console.error(`🚫 Error processing test runner for test case ${testCaseId}:`, testRunnerError);
          testRunnerFound = false;
        }
        
        // FALLBACK: Use AI generation ONLY if no database test runner found
        if (!testRunnerFound) {
          console.log(`⚠️ WARNING: No database test runner found for test case ${testCaseId}, language: ${language}`);
          console.log(`🎆 Falling back to AI generation (this should not happen if your database is properly configured)`);
          
          let problemDescription = '';
          try {
            const parsedQ = typeof codingQ.question === 'string' ? JSON.parse(codingQ.question) : codingQ.question;
            problemDescription = `${parsedQ.title}\n${parsedQ.description}\nConstraints: ${(parsedQ.constraints || []).join(' ')}`;
          } catch {
            problemDescription = typeof codingQ.question === 'string' ? codingQ.question : '';
          }
          
          fullCode = await generateFullCodeForTestCase(
            problemDescription,
            userCode,
            language,
            testCase.input,
            testCase.expected_output || testCase.expectedOutput
          );
        } else {
          console.log(`✅ Successfully using database test runner for test case ${testCaseId}`);
        }
        
        console.log(`📋 Generated complete program for test case ${testCaseId}:`);
        console.log('--- CODE START ---');
        console.log(fullCode);
        console.log('--- CODE END ---');
        
        // Clean and execute the code in Judge0
        const cleanedCode = stripMarkdownCodeBlocks(fullCode);
        if (!cleanedCode.trim()) {
          console.error(`⚠️ Generated code is empty for test case ${testCaseId}!`);
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expected_output || testCase.expectedOutput, // Standardize property name
            actualOutput: '',
            passed: false,
            error: 'Generated code is empty',
            testCaseId: testCaseId
          });
          continue;
        }

        const base64Source = Buffer.from(cleanedCode).toString('base64');
        const languageId = getLanguageId(language);
        
        console.log(`🚀 Sending test case ${testCaseId} to Judge0 (Language ID: ${languageId})`);
        
        try {
          const judge0Resp = await axios.post('https://judge0-ce.p.rapidapi.com/submissions?base64_encoded=true&wait=true', {
            source_code: base64Source,
            language_id: languageId,
            stdin: '',
          }, {
            headers: {
              'X-RapidAPI-Key': process.env.JUDGE0_API_KEY || '',
              'X-RapidAPI-Host': 'judge0-ce.p.rapidapi.com',
              'Content-Type': 'application/json',
            }
          });

          const { stdout, stderr, compile_output, status } = judge0Resp.data;
          const actualOutputRaw = stdout ? decodeBase64IfNeeded(stdout, true).trim() : '';
          const actualOutput = normalize(actualOutputRaw);
          const expectedOutputRaw = (testCase.expected_output || testCase.expectedOutput).trim();
          const expectedOutput = normalize(expectedOutputRaw);
          const passed = actualOutput === expectedOutput;

          console.log(`🎯 Test case ${testCaseId} results:`);
          console.log('  Expected:', expectedOutput);
          console.log('  Actual:', actualOutput);
          console.log('  Passed:', passed ? '✅' : '❌');
          if (stderr) console.log('  Stderr:', stderr);
          if (compile_output) console.log('  Compile Output:', compile_output);
          
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: expectedOutputRaw, // Standardize property name to camelCase
            actualOutput: actualOutputRaw,
            userOutput: actualOutputRaw,
            normalizedExpected: expectedOutput,
            normalizedActual: actualOutput,
            passed,
            stderr,
            compile_output,
            status,
            runtimeMs: judge0Resp.data.time ? Math.round(parseFloat(judge0Resp.data.time) * 1000) : 0,
            diff: passed ? '' : `Expected: '${expectedOutput}', Got: '${actualOutput}'`,
            testCaseId: testCaseId
          });
        } catch (err) {
          console.error(`⚠️ Error executing test case ${testCaseId} in Judge0:`, err);
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expected_output || testCase.expectedOutput, // Standardize property name
            actualOutput: '',
            passed: false,
            error: err instanceof Error ? err.message : String(err),
            testCaseId: testCaseId
          });
        }
      }
      
      // Calculate overall results
      const totalTests = testCaseResults.length;
      const passedTests = testCaseResults.filter(result => result.passed).length;
      const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
      
      console.log(`\n📊 Final Results Summary:`);
      console.log(`  Total Tests: ${totalTests}`);
      console.log(`  Passed: ${passedTests}`);
      console.log(`  Failed: ${totalTests - passedTests}`);
      console.log(`  Success Rate: ${successRate.toFixed(1)}%`);
      
      res.json({
        success: true,
        testCaseResults,
        totalTests,
        passedTests,
        successRate: Math.round(successRate)
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

  // Voice Stage Camera Analysis Routes
  const activeProcesses = new Map<number, { process: any, startTime: number }>();
  
  // Start voice and camera recording
  app.post('/api/interviews/:interviewId/voice/start', requireAuth, async (req: any, res) => {
    try {
      const interviewId = parseInt(req.params.interviewId);
      
      // Validate interview exists and belongs to user
      const interview = await storage.getInterview(interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      // Check if already recording
      if (activeProcesses.has(interviewId)) {
        return res.status(400).json({ message: 'Already recording for this interview' });
      }
      
      // Import child_process and path modules dynamically for ES modules
      const { spawn } = await import('child_process');
      const pathModule = await import('path');
      const fsModule = await import('fs');
      const urlModule = await import('url');
      
      // Get __dirname equivalent for ES modules
      const __filename = urlModule.fileURLToPath(import.meta.url);
      const __dirname = pathModule.dirname(__filename);
      
      const pythonScriptPath = pathModule.default.join(__dirname, 'analysis_voice_camera.py');
      // Use a simpler output file path without special characters
      const outputFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}.json`);
      const stopFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_stop.txt`);
      
      // Ensure the Python script exists
      if (!fsModule.default.existsSync(pythonScriptPath)) {
        return res.status(500).json({ message: 'Python analysis script not found' });
      }
      
      console.log(`[Voice Analysis] Starting process for interview ${interviewId}`);
      
      // Start Python process with 5-minute timeout (300 seconds)
      // Set DEBUG_VOICE_CAMERA environment variable to enable detailed logging in Python script
      const pythonProcess = spawn('python', [
        pythonScriptPath,
        '--output', outputFilePath,
        '--duration', '300',
        '--stop-file', stopFilePath  // ADD THIS LINE
      ], {
        cwd: __dirname,
        env: {
          ...process.env,
          DEBUG_VOICE_CAMERA: 'true' // Enable debug logging to see what's happening
        }
      });
      
      // Handle process errors
      pythonProcess.on('error', (error: any) => {
        console.error('[Voice Analysis] Python process error:', error);
        activeProcesses.delete(interviewId);
      });
      
      // Handle process exit
      pythonProcess.on('exit', (code: any, signal: any) => {
        console.log(`[Voice Analysis] Python process exited with code ${code} and signal ${signal}`);
        activeProcesses.delete(interviewId);
      });
      
      // Capture only essential stdout and stderr for debugging
      pythonProcess.stdout.on('data', (data: any) => {
        const output = data.toString();
        // Only log essential information or errors
        if (output.includes('[ERROR]') || output.includes('Error') || process.env.DEBUG) {
          console.log(`[Voice Analysis] Python stdout: ${output}`);
        }
      });
      
      pythonProcess.stderr.on('data', (data: any) => {
        const errorOutput = data.toString();
        // Log errors and warnings
        if (errorOutput.includes('[ERROR]') || errorOutput.includes('Error') || errorOutput.includes('Warning') || process.env.DEBUG) {
          console.error(`[Voice Analysis] Python stderr: ${errorOutput}`);
        }
      });
      
      // Also capture close event
      pythonProcess.on('close', (code: any, signal: any) => {
        console.log(`[Voice Analysis] Python process closed with code ${code} and signal ${signal}`);
        activeProcesses.delete(interviewId);
      });
      
      // Store process reference
      activeProcesses.set(interviewId, {
        process: pythonProcess,
        startTime: Date.now()
      });
      
      console.log(`[Voice Analysis] Started voice+camera analysis for interview ${interviewId}`);
      res.json({ 
        success: true, 
        message: 'Started voice and camera recording',
        processId: pythonProcess.pid
      });
    } catch (error) {
      console.error('[Voice Analysis] Error starting voice analysis:', error);
      res.status(500).json({ message: 'Failed to start voice analysis', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  
  // Stop voice and camera recording and get results
  app.post('/api/interviews/:interviewId/voice/stop', requireAuth, async (req: any, res) => {
    try {
      const interviewId = parseInt(req.params.interviewId);
      
      // Validate interview exists and belongs to user
      const interview = await storage.getInterview(interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      // Check if recording is active
      const processInfo = activeProcesses.get(interviewId);
      if (!processInfo) {
        // Check if output file exists (process might have finished)
        const fsModule = await import('fs');
        const pathModule = await import('path');
        const urlModule = await import('url');
        
        // Get __dirname equivalent for ES modules
        const __filename = urlModule.fileURLToPath(import.meta.url);
        const __dirname = pathModule.dirname(__filename);
        
        const outputFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}.json`);
        
        if (fsModule.default.existsSync(outputFilePath)) {
          console.log(`[Voice Analysis] Process already finished, reading existing output for interview ${interviewId}`);
        } else {
          console.log(`[Voice Analysis] No active process and no output file found for interview ${interviewId}`);
          return res.status(400).json({ message: 'No active recording for this interview' });
        }
      } else {
        // Instead of sending SIGTERM immediately, create a stop file that the Python script can check
        const fsModule = await import('fs');
        const pathModule = await import('path');
        const urlModule = await import('url');
        
        // Get __dirname equivalent for ES modules
        const __filename = urlModule.fileURLToPath(import.meta.url);
        const __dirname = pathModule.dirname(__filename);
        
        const stopFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_stop.txt`);
        
        console.log(`[Voice Analysis] Creating stop file: ${stopFilePath}`);
        try {
          fsModule.default.writeFileSync(stopFilePath, 'stop');
          console.log(`[Voice Analysis] Stop file created successfully`);
        } catch (writeError) {
          console.error(`[Voice Analysis] Failed to create stop file: ${writeError}`);
        }
        
        // Give the Python script more time to notice the stop file and clean up properly
        console.log(`[Voice Analysis] Waiting for Python script to finish cleanup...`);
        await new Promise(resolve => setTimeout(resolve, 30000)); // Increased to 30 seconds for cleanup
        
        // Now send SIGTERM as a backup/fallback
        const { process } = processInfo;
        console.log(`[Voice Analysis] Sending SIGTERM to process for interview ${interviewId} with PID: ${process.pid}`);
        try {
          process.kill('SIGTERM');
        } catch (killError) {
          console.warn(`[Voice Analysis] Could not send SIGTERM: ${killError}`);
        }
        
        // Wait for cleanup to complete (increased time for Whisper transcription)
        await new Promise(resolve => setTimeout(resolve, 45000)); // Increased to 45 seconds
        
        // Wait for process to actually exit - with proper timeout handling
        const exitPromise = new Promise((resolve) => {
          process.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
            console.log(`[Voice Analysis] Python process exited with code ${code} and signal ${signal}`);
            resolve({ code, signal });
          });
          // Also capture close event
          process.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
            console.log(`[Voice Analysis] Python process closed with code ${code} and signal ${signal}`);
            resolve({ code, signal });
          });
        });
        
        // Wait for process exit or timeout (increased timeout to allow cleanup)
        try {
          await Promise.race([
            exitPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 90000)) // Increased to 90 seconds timeout
          ]);
          console.log(`[Voice Analysis] Process exited normally for interview ${interviewId}`);
        } catch (timeoutError) {
          console.warn(`[Voice Analysis] Process timeout for interview ${interviewId}, forcing kill`);
          try {
            process.kill('SIGKILL');
          } catch (forceKillError) {
            console.warn(`[Voice Analysis] Could not force kill process: ${forceKillError}`);
          }
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait a bit after force kill
        }
        
        // Remove stop file if it exists
        try {
          if (fsModule.default.existsSync(stopFilePath)) {
            fsModule.default.unlinkSync(stopFilePath);
            console.log(`[Voice Analysis] Removed stop file: ${stopFilePath}`);
          }
        } catch (unlinkError) {
          console.warn(`[Voice Analysis] Could not remove stop file: ${unlinkError}`);
        }
        
        // Remove from active processes
        activeProcesses.delete(interviewId);
        console.log(`[Voice Analysis] Removed process from active processes for interview ${interviewId}`);
      }
      
      // Read analysis results
      const fsModule = await import('fs');
      const pathModule = await import('path');
      const urlModule = await import('url');
      
      // Get __dirname equivalent for ES modules
      const __filename = urlModule.fileURLToPath(import.meta.url);
      const __dirname = pathModule.dirname(__filename);
      
      const outputFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}.json`);
      
      console.log(`[Voice Analysis] Reading output file: ${outputFilePath}`);
      
      // Debug: List all files in directory
      try {
        const files = fsModule.default.readdirSync(__dirname);
        console.log(`[Voice Analysis] Files in server directory:`, files.filter(f => f.includes('analysis') || f.includes('.json') || f.includes('.wav')));
      } catch (e) {
        console.log(`[Voice Analysis] Could not list directory files: ${e}`);
      }
      
      let analysisData;
      
      // Wait for file to be written with more robust retry logic
      await new Promise(resolve => setTimeout(resolve, 5000)); // Initial wait time
      
      let fileExists = fsModule.default.existsSync(outputFilePath);
      console.log(`[Voice Analysis] File exists: ${fileExists}`);
      
      if (!fileExists) {
        // Wait a bit longer for file creation with more attempts
        for (let i = 0; i < 60; i++) { // 60 attempts with 1000ms delay = 60 seconds
          await new Promise(resolve => setTimeout(resolve, 1000));
          if (fsModule.default.existsSync(outputFilePath)) {
            fileExists = true;
            console.log(`[Voice Analysis] File found after waiting`);
            // Additional wait to ensure file is fully written
            await new Promise(resolve => setTimeout(resolve, 5000));
            break;
          }
        }
      } else {
        // File exists, but wait a bit to ensure it's fully written
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
      if (fileExists) {
        try {
          // Try to read the file with retry logic in case of partial writes
          let rawData = '';
          let readAttempts = 0;
          const maxReadAttempts = 20;
          
          while (readAttempts < maxReadAttempts) {
            try {
              rawData = fsModule.default.readFileSync(outputFilePath, 'utf8');
              console.log(`[Voice Analysis] File size: ${rawData.length} chars`);
              
              // Check if file has valid JSON content
              if (rawData.trim().length > 0) {
                // Try to parse to ensure it's valid JSON
                JSON.parse(rawData);
                break; // Success, exit the retry loop
              }
            } catch (parseError) {
              readAttempts++;
              console.warn(`[Voice Analysis] File read attempt ${readAttempts} failed, retrying...`);
              if (readAttempts < maxReadAttempts) {
                await new Promise(resolve => setTimeout(resolve, 3000));
              } else {
                throw parseError;
              }
            }
          }
          
          if (rawData.trim().length > 0) {
            const parsedData = JSON.parse(rawData);
            console.log(`[Voice Analysis] Parsed data successfully`);
            console.log(`[Voice Analysis] Transcript length: ${parsedData.transcript?.length || 0}`);
            console.log(`[Voice Analysis] Data quality: ${parsedData.data_quality}`);
            
            // Log detection statistics if available
            if (parsedData.detection_stats) {
              console.log(`[Voice Analysis] Detection stats:`, parsedData.detection_stats);
              
              // Check for specific failure conditions
              if (parsedData.detection_stats.error) {
                console.warn(`[Voice Analysis] Detection failed with error: ${parsedData.detection_stats.error}`);
              }
              
              const framesProcessed = parsedData.detection_stats.frames_processed || 0;
              const successfulAnalyses = parsedData.detection_stats.successful_analyses || 0;
              const duration = parsedData.detection_stats.duration || 0;
              const successRate = framesProcessed > 0 ? (successfulAnalyses / framesProcessed) : 0;
              
              console.log(`[Voice Analysis] Detection success rate: ${(successRate * 100).toFixed(1)}%`);
              console.log(`[Voice Analysis] Analysis duration: ${duration.toFixed(1)} seconds`);
              
              // If analysis time is very short, log a warning
              if (duration < 5) {
                console.warn(`[Voice Analysis] WARNING: Very short analysis time (${duration.toFixed(1)}s) - results may be unreliable`);
              } else if (duration < 10) {
                console.warn(`[Voice Analysis] NOTE: Short analysis time (${duration.toFixed(1)}s) - results may have limited accuracy`);
              }
              
              // If no frames were processed, add a specific warning about camera issues
              if (framesProcessed === 0) {
                console.warn(`[Voice Analysis] WARNING: No camera frames were processed - camera analysis will be unreliable`);
                // Add a note to the analysis data
                if (!parsedData.analysis_note) {
                  parsedData.analysis_note = 'Camera access failed - visual analysis unavailable. Please check camera permissions and connections.';
                } else {
                  parsedData.analysis_note += ' Camera access failed - visual analysis unavailable.';
                }
              }
              
              // If success rate is very low, log a warning
              if (framesProcessed > 0 && successRate < 0.1 && duration >= 5) {
                console.warn(`[Voice Analysis] WARNING: Very low detection success rate (${(successRate * 100).toFixed(1)}%) - check camera lighting and positioning`);
              }
            }
            
            // Always use the parsed data
            analysisData = parsedData;
            
            // Clean up
            try {
              fsModule.default.unlinkSync(outputFilePath);
              // Also clean up the WAV file if it exists
              const wavFilePath = outputFilePath.replace('.json', '.wav');
              if (fsModule.default.existsSync(wavFilePath)) {
                fsModule.default.unlinkSync(wavFilePath);
              }
              // Also clean up temp file if it exists
              const tempFilePath = outputFilePath.replace('.json', '_temp.json');
              if (fsModule.default.existsSync(tempFilePath)) {
                fsModule.default.unlinkSync(tempFilePath);
              }
              // Also clean up stop file if it exists
              const stopFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_stop.txt`);
              if (fsModule.default.existsSync(stopFilePath)) {
                fsModule.default.unlinkSync(stopFilePath);
              }
            } catch (unlinkError) {
              console.warn(`[Voice Analysis] Warning: Could not delete output files: ${unlinkError}`);
            }
          } else {
            throw new Error('Empty file content');
          }
        } catch (parseError) {
          console.error(`[Voice Analysis] Error parsing file:`, parseError);
          // Use research-based fallback data
          analysisData = {
            transcript: '',
            dominant_emotion: 'neutral',
            eye_contact_pct: 0.4,
            head_movement_std: 0.6,
            avg_posture_score: 0.6,
            emotion_log: [],
            data_quality: 'very_low',
            frames_collected: 0,
            analysis_note: 'Analysis failed - using research-based defaults',
            detection_stats: { error: 'file_parsing_failed', quality_note: 'File parsing failed - results unreliable' }
          };
        }
      } else {
        console.warn(`[Voice Analysis] File not found, using research-based defaults`);
        analysisData = {
          transcript: '',
          dominant_emotion: 'neutral',
          eye_contact_pct: 0.4,
          head_movement_std: 0.6,
          avg_posture_score: 0.6,
          emotion_log: [],
          data_quality: 'very_low',
          frames_collected: 0,
          analysis_note: 'No data collected - using research-based defaults',
          detection_stats: { error: 'file_not_found', quality_note: 'No data file found - results unreliable' }
        };
      }
      
      // Log what we're working with
      console.log(`[Voice Analysis] Final data quality: ${analysisData.data_quality}`);
      console.log(`[Voice Analysis] Transcript available: ${!!(analysisData.transcript && analysisData.transcript.length > 0)}`);
      console.log(`[Voice Analysis] Frames collected: ${analysisData.frames_collected || 0}`);
      
      // Check if analysis time was too short for reliable results
      let isReliable = true;
      let reliabilityNote = '';
      
      if (analysisData.detection_stats) {
        const duration = analysisData.detection_stats.duration || 0;
        const qualityNote = analysisData.detection_stats.quality_note || '';
        
        if (duration < 5) {
          isReliable = false;
          reliabilityNote = `Analysis time was very short (${duration.toFixed(1)}s) - results are not reliable. Please record for at least 10 seconds for accurate analysis.`;
        } else if (duration < 10) {
          reliabilityNote = `Analysis time was short (${duration.toFixed(1)}s) - results may have limited accuracy. For best results, record for 15+ seconds.`;
        } else if (qualityNote) {
          reliabilityNote = qualityNote;
        }
      }
      
      // Send transcript to Gemini for evaluation (only if we have a transcript)
      let geminiEvaluation: { score: number; feedback: string; suggestions: string[] } = { 
        score: 60, 
        feedback: 'Based on interview research: Maintain good eye contact (40% average), show moderate head movement, and keep upright posture.', 
        suggestions: [
          'Try to maintain eye contact with the camera', 
          'Keep a natural, relaxed posture', 
          'Show appropriate facial expressions'
        ] 
      };
      
      try {
        if (analysisData.transcript && analysisData.transcript.trim().length > 0) {
          console.log(`[Voice Analysis] Sending transcript to Gemini for evaluation (${analysisData.transcript.length} chars)`);
          geminiEvaluation = await evaluateVoiceResponse(
            '', // Current question would be needed here
            analysisData.transcript,
            interview.role
          );
          console.log(`[Voice Analysis] Gemini evaluation completed - score: ${geminiEvaluation.score}`);
        } else {
          console.log(`[Voice Analysis] No transcript available for Gemini evaluation, using research-based feedback`);
          // Add note about unreliable results if needed
          if (!isReliable) {
            geminiEvaluation.feedback += ` NOTE: ${reliabilityNote}`;
          }
        }
      } catch (evalError) {
        console.error('[Voice Analysis] Gemini evaluation error:', evalError);
        // Provide research-based feedback when AI evaluation fails
        geminiEvaluation = {
          score: 60,
          feedback: 'Based on interview research: Your speaking patterns suggest good engagement. Areas for improvement include maintaining consistent eye contact and varying your tone.',
          suggestions: [
            'Practice maintaining eye contact with the camera',
            'Vary your speaking tone to show engagement',
            'Keep a natural, relaxed posture',
            'Show appropriate facial expressions'
          ]
        };
        
        // Add note about unreliable results if needed
        if (!isReliable) {
          geminiEvaluation.feedback += ` NOTE: ${reliabilityNote}`;
        }
      }
      
      // If results are not reliable, adjust the data quality and add warnings
      if (!isReliable) {
        analysisData.data_quality = 'very_low';
        if (analysisData.analysis_note) {
          analysisData.analysis_note += ` - ${reliabilityNote}`;
        } else {
          analysisData.analysis_note = reliabilityNote;
        }
      }
      
      // Calculate visual score (weighted combination)
      const eyeContactScore = analysisData.eye_contact_pct || 0.5;
      const emotionScore = analysisData.dominant_emotion === 'happy' || analysisData.dominant_emotion === 'neutral' ? 1.0 : 0.7;
      const visualScore = (eyeContactScore * 0.6) + (emotionScore * 0.4);
      
      // Calculate posture score
      const postureScore = analysisData.avg_posture_score || 0.5;
      
      // Calculate final combined score
      const geminiScore = geminiEvaluation.score / 100;
      const finalScore = (0.6 * geminiScore) + (0.3 * visualScore) + (0.1 * postureScore);
      
      // Prepare response data
      const responseData = {
        transcript: analysisData.transcript || '',
        geminiScore: geminiEvaluation.score,
        geminiFeedback: geminiEvaluation.feedback,
        dominantEmotion: analysisData.dominant_emotion || 'neutral',
        eyeContactPct: analysisData.eye_contact_pct || 0.5,
        headMovementStd: analysisData.head_movement_std || 0.5,
        postureScore: analysisData.avg_posture_score || 0.5,
        visualScore: visualScore,
        finalScore: Math.round(finalScore * 100),
        emotionLog: analysisData.emotion_log || [],
        // Add quality indicators
        dataQuality: analysisData.data_quality || 'unknown',
        framesCollected: analysisData.frames_collected || 0,
        analysisNote: analysisData.analysis_note || 'Analysis completed'
      };
      
      // Add a warning if data quality is poor
      if (analysisData.data_quality === 'poor' || analysisData.data_quality === 'limited') {
        console.warn(`[Voice Analysis] Poor data quality for interview ${interviewId}:`, analysisData.analysis_note);
        // Add a note to the feedback about the quality issue
        if (responseData.geminiFeedback) {
          responseData.geminiFeedback += ` Note: ${analysisData.analysis_note}`;
        } else {
          responseData.geminiFeedback = analysisData.analysis_note;
        }
      }
      
      console.log(`[Voice Analysis] Sending response for interview ${interviewId}:`, {
        hasTranscript: !!responseData.transcript,
        transcriptLength: responseData.transcript?.length || 0,
        finalScore: responseData.finalScore,
        dataQuality: responseData.dataQuality,
        framesCollected: responseData.framesCollected
      });
      
      res.json(responseData);
    } catch (error) {
      console.error('[Voice Analysis] Error stopping voice analysis:', error);
      res.status(500).json({ message: 'Failed to stop voice analysis', error: error instanceof Error ? error.message : 'Unknown error' });
    }
  });
  // Add a new endpoint to check if Python script is working
  app.get('/api/interviews/:interviewId/voice/status', requireAuth, async (req: any, res) => {
    try {
      const interviewId = parseInt(req.params.interviewId);
      
      // Validate interview exists and belongs to user
      const interview = await storage.getInterview(interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      // Check if recording is active
      const processInfo = activeProcesses.get(interviewId);
      const isActive = !!processInfo;
      
      res.json({ 
        active: isActive,
        startTime: processInfo?.startTime || null
      });
    } catch (error) {
      console.error('Error checking voice analysis status:', error);
      res.status(500).json({ message: 'Failed to check voice analysis status' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}

