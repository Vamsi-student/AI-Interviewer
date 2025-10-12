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
  generateFullCodeForTestCase,
} from "./services/gemini";
import { transcribeAudio } from "./services/whisper";
import axios from "axios";
import { db } from "./db";
import { codingProblems, users, questions } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ==================== HELPER FUNCTIONS ====================

function mapExperienceToDifficulty(experienceLevel: string): string {
  const expLevel = experienceLevel.toLowerCase();
  if (expLevel.includes('beginner') || expLevel.includes('entry') || expLevel.includes('junior')) {
    return 'Easy';
  } else if (expLevel.includes('senior') || expLevel.includes('expert') || expLevel.includes('lead')) {
    return 'Hard';
  }
  return 'Medium';
}

function getLanguageId(language: string): number {
  const map: Record<string, number> = {
    'c': 50, 'cpp': 54, 'c++': 54, 'python': 71, 'python3': 71,
    'java': 62, 'javascript': 63, 'typescript': 74, 'go': 60,
    'ruby': 72, 'php': 68, 'c#': 51, 'cs': 51, 'swift': 83,
    'kotlin': 78, 'rust': 73, 'scala': 81
  };
  return map[language.toLowerCase()] || 71;
}

function stripMarkdownCodeBlocks(code: string): string {
  return code.split(/\r?\n/).filter(line => !/^\s*`+/.test(line)).join('\n').trim();
}

function decodeBase64IfNeeded(str: string): string {
  if (!str) return '';
  try {
    const decoded = Buffer.from(str, 'base64').toString('utf-8');
    if (/^[\x09\x0A\x0D\x20-\x7E]*$/.test(decoded) && decoded.length > 0) {
      return decoded;
    }
  } catch (e) {
    return str;
  }
  return str;
}

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// ==================== MAIN ROUTES REGISTRATION ====================

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Configure multer for file uploads
  const uploadsDir = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const upload = multer({ 
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, uploadsDir),
      filename: (req, file, cb) => cb(null, `audio_${Date.now()}.wav`)
    }),
    limits: { fileSize: 10 * 1024 * 1024 }
  });

  // ==================== AUTH MIDDLEWARE ====================

  const requireAuth = async (req: any, res: any, next: any) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ message: 'No token provided' });
      }

      const token = authHeader.substring(7);
      
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

  // ==================== AUTH ROUTES ====================

  app.post('/api/auth/verify', async (req, res) => {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }

      if (token === 'demo-token') {
        let user = await storage.getUserByFirebaseUid('demo-user-123');
        if (!user) {
          user = await storage.createUser({
            firebaseUid: 'demo-user-123',
            email: 'demo@example.com',
            name: 'Demo User'
          });
        }
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
      user = await storage.updateUser(user.id, { lastSignIn: new Date() }) || user;
      res.json({ user });
    } catch (error) {
      console.error('Auth verification error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  app.put('/api/profile', requireAuth, async (req: any, res) => {
    try {
      const { name, bio, profileImage } = req.body;
      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (bio !== undefined) updateData.bio = bio;
      if (profileImage !== undefined) updateData.profileImage = profileImage;
      
      const updatedUser = await storage.updateUser(req.user.id, updateData);
      res.json({ user: updatedUser });
    } catch (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ message: 'Failed to update profile' });
    }
  });

  // ==================== INTERVIEW ROUTES ====================

  // Helper function to generate questions for interview
  async function generateInterviewQuestions(interview: any) {
    const mcqQuestions = await generateMCQQuestions(interview.role, interview.experienceLevel, 5);
    
    const dbDifficulty = mapExperienceToDifficulty(interview.experienceLevel);
    let problems = await db.select().from(codingProblems)
      .where(eq(codingProblems.problemHardnessLevel, dbDifficulty))
      .limit(5);
    
    if (problems.length === 0) {
      problems = await db.select().from(codingProblems).limit(5);
    }
    
    const codingProblem = problems.length > 0 ? problems[Math.floor(Math.random() * problems.length)] : null;
    
    return { mcqQuestions, codingProblem };
  }

  app.post('/api/interviews', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.createInterview({
        ...req.body,
        userId: req.user.id,
        currentStage: 1,
      });

      const { mcqQuestions, codingProblem } = await generateInterviewQuestions(interview);
      
      let createdQuestions = 0;
      
      // Create MCQ questions
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
          }
        }
      }

      // Create coding question
      if (codingProblem?.problemTitle && codingProblem?.problemDescription) {
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify({
            title: codingProblem.problemTitle,
            description: codingProblem.problemDescription,
            constraints: codingProblem.constraints,
            examples: codingProblem.examples,
            problemId: codingProblem.id
          }),
          testCases: codingProblem.testCases || [],
          aiGenerated: false,
          options: [],
          correctAnswer: '',
        });
        createdQuestions++;
      }

      if (createdQuestions === 0) {
        await storage.deleteInterview(interview.id);
        return res.status(500).json({ message: 'Failed to generate questions' });
      }

      res.json(interview);
    } catch (error) {
      console.error('Error creating interview:', error);
      res.status(400).json({ message: 'Failed to create interview' });
    }
  });

  app.post('/api/interviews/:id/regenerate-questions', requireAuth, async (req: any, res) => {
    try {
      const interviewId = parseInt(req.params.id);
      const interview = await storage.getInterview(interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      // Delete existing questions and responses
      const existingQuestions = await storage.getQuestionsByInterviewId(interviewId);
      for (const q of existingQuestions) {
        const responses = await storage.getResponsesByQuestionId(q.id);
        for (const r of responses) {
          await storage.deleteResponse(r.id);
        }
        await storage.deleteQuestion(q.id);
      }

      const { mcqQuestions, codingProblem } = await generateInterviewQuestions(interview);
      
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
          }
        }
      }

      if (codingProblem?.problemTitle && codingProblem?.problemDescription) {
        const q = await storage.createQuestion({
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify({
            title: codingProblem.problemTitle,
            description: codingProblem.problemDescription,
            constraints: codingProblem.constraints,
            examples: codingProblem.examples,
            problemId: codingProblem.id
          }),
          testCases: codingProblem.testCases || [],
          aiGenerated: false,
          options: [],
          correctAnswer: '',
        });
        created.push(q);
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
      
      if (!interview) {
        return res.status(404).json({ message: 'Interview not found' });
      }
      
      if (interview.userId !== req.user.id) {
        return res.status(403).json({ message: 'Forbidden' });
      }
      
      if (!interview.currentStage) {
        const updatedInterview = await storage.updateInterview(interview.id, { currentStage: 1 });
        return res.json(updatedInterview);
      }
      
      res.json(interview);
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

  // ==================== QUESTION ROUTES ====================

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

      const previousQA = req.body.previousQA || [];
      const existingQuestions = await storage.getQuestionsByInterviewId(interview.id);
      const voiceQuestions = existingQuestions.filter(q => q.stage === 3).map(q => q.question);

      let question;
      if (previousQA.length === 0) {
        question = `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`;
      } else {
        try {
          question = await generateVoiceQuestion(interview.role, interview.experienceLevel, voiceQuestions, previousQA);
        } catch (error) {
          question = `Thank you for that response. Could you tell me more about your experience with ${interview.role}?`;
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

      res.json(createdQuestion);
    } catch (error) {
      console.error('Error generating voice question:', error);
      res.status(500).json({ message: 'Failed to generate voice question' });
    }
  });

  // ==================== RESPONSE ROUTES ====================

  app.post('/api/responses', requireAuth, async (req: any, res) => {
    try {
      const { questionId, answer, audioBlob, codingEvaluation, voiceAnalysisData } = req.body;
      
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }

      let interview = await storage.getInterview(question.interviewId);
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      let transcription = '';
      if (audioBlob && question.type === 'voice') {
        try {
          const audioBuffer = Buffer.from(audioBlob, 'base64');
          transcription = await transcribeAudio(audioBuffer);
        } catch (error) {
          console.error('Error transcribing audio:', error);
        }
      }

      const finalAnswer = transcription || answer;
      let evaluation: any = { score: 0, isCorrect: false, feedback: '' };
      let navigateToStage3 = false;
      let nextQuestion = null;

      // Evaluate based on question type
      if (question.type === 'mcq') {
        evaluation = await evaluateMCQAnswer(question.question, finalAnswer, question.correctAnswer || '');
        evaluation.score = evaluation.isCorrect ? 100 : 0;
      } else if (question.type === 'voice') {
        // Use voice analysis data if available
        if (voiceAnalysisData?.finalScore !== undefined) {
          evaluation = {
            score: voiceAnalysisData.finalScore,
            isCorrect: voiceAnalysisData.finalScore >= 60,
            feedback: voiceAnalysisData.geminiFeedback || 'Voice response evaluated',
            ...voiceAnalysisData
          };
        } else {
          const minWords = 5;
          const wordCount = finalAnswer.trim().split(/\s+/).length;
          
          if (wordCount < minWords) {
            evaluation = {
              score: 0,
              isCorrect: false,
              feedback: 'Answer too short or not relevant.',
              suggestions: ['Please provide a more detailed answer.'],
            };
          } else {
            const voiceEval = await evaluateVoiceResponse(question.question, finalAnswer, interview.role);
            evaluation = {
              ...voiceEval,
              isCorrect: voiceEval.score >= 60,
              score: voiceEval.score,
            };
          }
        }

        // Generate next voice question
        const MAX_VOICE_QUESTIONS = 5;
        const allResponses = await storage.getResponsesByInterviewId(interview.id);
        const allQuestions = await storage.getQuestionsByInterviewId(interview.id);
        
        const previousQA = allResponses
          .filter(r => allQuestions.find(q => q.id === r.questionId && q.type === 'voice'))
          .map(resp => {
            const q = allQuestions.find(q => q.id === resp.questionId);
            return {
              question: q?.question || '',
              answer: resp.answer || resp.transcription || ''
            };
          });

        if (previousQA.length < MAX_VOICE_QUESTIONS) {
          const voiceQuestions = allQuestions.filter(q => q.stage === 3 && q.type === 'voice').map(q => q.question);
          
          let nextQuestionText;
          try {
            nextQuestionText = await generateVoiceQuestion(
              interview.role, 
              interview.experienceLevel, 
              voiceQuestions, 
              previousQA,
              false
            );
          } catch (error) {
            const fallbacks = [
              `Could you tell me about a specific project you've worked on as a ${interview.role}?`,
              `What technologies or tools are you most comfortable with?`,
              `Tell me about a time you solved a challenging problem.`
            ];
            nextQuestionText = fallbacks[previousQA.length % fallbacks.length];
          }
          
          nextQuestion = await storage.createQuestion({
            interviewId: interview.id,
            stage: 3,
            type: 'voice',
            question: nextQuestionText,
            aiGenerated: true,
            options: [],
            correctAnswer: '',
            testCases: [],
          });
        }
      } else if (question.type === 'coding') {
        const numPassed = codingEvaluation?.testCaseResults?.filter((tc: any) => tc.passed).length || 0;
        const total = codingEvaluation?.testCaseResults?.length || 0;
        const score = total > 0 ? Math.round((numPassed / total) * 100) : 0;

        evaluation = {
          score,
          isCorrect: numPassed === total && total > 0,
          summary: `Passed ${numPassed} out of ${total} test cases.`,
          ...(codingEvaluation || {}),
        };

        // Transition to stage 3
        if (interview.currentStage === 2) {
          interview = await storage.updateInterview(interview.id, { currentStage: 3 }) || interview;
          
          const existingVoiceQuestions = (await storage.getQuestionsByInterviewId(interview.id))
            .filter(q => q.stage === 3 && q.type === 'voice');
          
          if (existingVoiceQuestions.length === 0) {
            await storage.createQuestion({
              interviewId: interview.id,
              stage: 3,
              type: 'voice',
              question: `Hello, welcome to your interview! Could you please introduce yourself and tell me a bit about your background?`,
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
        audioUrl: '',
        transcription,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation,
      });

      const updatedInterviewState = await storage.getInterview(interview.id);

      res.json({
        success: true,
        response: savedResponse,
        interview: updatedInterviewState,
        navigateToStage3,
        nextQuestion
      });
    } catch (error) {
      console.error('Error creating response:', error);
      res.status(500).json({ message: 'Failed to create response' });
    }
  });

  app.get('/api/interviews/:id/responses', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      const responses = await storage.getResponsesByInterviewId(interview.id);
      res.json(responses);
    } catch (error) {
      res.status(500).json({ message: 'Failed to fetch responses' });
    }
  });

  // ==================== CODE EXECUTION ====================

  app.post('/api/code/execute', requireAuth, async (req, res) => {
    try {
      const { userCode, interviewId, language } = req.body;

      if (!userCode || !interviewId || !language) {
        return res.status(400).json({ message: 'Missing required fields' });
      }

      const codingQArr = await db.select().from(questions)
        .where(and(eq(questions.interviewId, interviewId), eq(questions.type, 'coding'), eq(questions.stage, 2)))
        .limit(1);
      
      const codingQ = codingQArr[0];
      if (!codingQ) {
        return res.status(404).json({ message: 'Coding question not found' });
      }

      let problemId = null;
      try {
        const parsedQuestion = typeof codingQ.question === 'string' ? JSON.parse(codingQ.question) : codingQ.question;
        problemId = parsedQuestion.problemId;
      } catch (err) {}

      let codingProblem = null;
      if (problemId) {
        const problemArr = await db.select().from(codingProblems)
          .where(eq(codingProblems.id, problemId))
          .limit(1);
        codingProblem = problemArr[0];
      }

      let testCasesList: any[] = [];
      if (codingProblem?.testCases) {
        testCasesList = Array.isArray(codingProblem.testCases) ? codingProblem.testCases : JSON.parse(codingProblem.testCases as string);
      } else if (Array.isArray(codingQ.testCases)) {
        testCasesList = codingQ.testCases;
      } else if (typeof codingQ.testCases === 'string') {
        try {
          testCasesList = JSON.parse(codingQ.testCases);
        } catch {}
      }
      
      if (!testCasesList.length) {
        return res.status(404).json({ message: 'No test cases found' });
      }

      let testRunners = null;
      if (codingProblem?.testRunners) {
        testRunners = typeof codingProblem.testRunners === 'string' 
          ? JSON.parse(codingProblem.testRunners) 
          : codingProblem.testRunners;
      }

      const testCaseResults = [];
      
      for (let i = 0; i < testCasesList.length; i++) {
        const testCase = testCasesList[i];
        const testCaseId = i + 1;
        
        let fullCode = '';
        let testRunnerFound = false;
        
        if (testRunners?.[language]) {
          const languageRunners = testRunners[language];
          
          if (Array.isArray(languageRunners)) {
            const specificRunner = languageRunners.find(runner => 
              runner.test_case_id === testCaseId || runner.test_case_id === testCaseId.toString()
            );
            
            if (specificRunner?.code) {
              fullCode = `${userCode}\n\n${specificRunner.code}`;
              testRunnerFound = true;
            }
          }
        }
        
        if (!testRunnerFound) {
          let problemDescription = '';
          try {
            const parsedQ = typeof codingQ.question === 'string' ? JSON.parse(codingQ.question) : codingQ.question;
            problemDescription = `${parsedQ.title}\n${parsedQ.description}`;
          } catch {}
          
          fullCode = await generateFullCodeForTestCase(
            problemDescription,
            userCode,
            language,
            testCase.input,
            testCase.expected_output || testCase.expectedOutput
          );
        }
        
        const cleanedCode = stripMarkdownCodeBlocks(fullCode);
        if (!cleanedCode.trim()) {
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expected_output || testCase.expectedOutput,
            actualOutput: '',
            passed: false,
            error: 'Generated code is empty',
            testCaseId
          });
          continue;
        }

        const base64Source = Buffer.from(cleanedCode).toString('base64');
        const languageId = getLanguageId(language);
        
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
          const actualOutputRaw = stdout ? decodeBase64IfNeeded(stdout).trim() : '';
          const actualOutput = normalize(actualOutputRaw);
          const expectedOutputRaw = (testCase.expected_output || testCase.expectedOutput).trim();
          const expectedOutput = normalize(expectedOutputRaw);
          const passed = actualOutput === expectedOutput;
          
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: expectedOutputRaw,
            actualOutput: actualOutputRaw,
            normalizedExpected: expectedOutput,
            normalizedActual: actualOutput,
            passed,
            stderr,
            compile_output,
            status,
            runtimeMs: judge0Resp.data.time ? Math.round(parseFloat(judge0Resp.data.time) * 1000) : 0,
            testCaseId
          });
        } catch (err) {
          testCaseResults.push({
            input: testCase.input,
            expectedOutput: testCase.expected_output || testCase.expectedOutput,
            actualOutput: '',
            passed: false,
            error: err instanceof Error ? err.message : String(err),
            testCaseId
          });
        }
      }
      
      const totalTests = testCaseResults.length;
      const passedTests = testCaseResults.filter(result => result.passed).length;
      const successRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
      
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

  // ==================== INTERVIEW COMPLETION ====================

  app.post('/api/interviews/:id/complete', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      const responses = await storage.getResponsesByInterviewId(interview.id);

      const responsesWithQuestionType = await Promise.all(responses.map(async (response) => {
        const question = await storage.getQuestion(response.questionId);
        return {
          ...response,
          type: question?.type || 'unknown',
        };
      }));

      const rawFeedback = await generateInterviewFeedback(responsesWithQuestionType, interview.role, interview.experienceLevel);

      const overallScore = (rawFeedback && typeof rawFeedback.overallScore === 'number') ? rawFeedback.overallScore : 0;
      const feedback = {
        ...rawFeedback,
        overallScore,
        strengths: rawFeedback?.strengths || [],
        weaknesses: rawFeedback?.weaknesses || [],
        recommendations: rawFeedback?.recommendations || [],
      };

      const updatedInterview = await storage.updateInterview(interview.id, {
        status: 'completed',
        completedAt: new Date(),
        overallScore: overallScore,
        feedback: feedback,
      });

      res.json(updatedInterview);
    } catch (error) {
      console.error('Error completing interview:', error);
      res.status(500).json({ message: 'Failed to complete interview' });
    }
  });

  // ==================== VOICE ANALYSIS ROUTES ====================

 const activeProcesses = new Map<number, { process: any, startTime: number }>();

app.post('/api/interviews/:interviewId/voice/start', requireAuth, async (req: any, res) => {
  try {
    const interviewId = parseInt(req.params.interviewId);
    
    const interview = await storage.getInterview(interviewId);
    if (!interview || interview.userId !== req.user.id) {
      return res.status(404).json({ message: 'Interview not found' });
    }
    
    if (activeProcesses.has(interviewId)) {
      return res.status(400).json({ message: 'Already recording' });
    }
    
    const { spawn } = await import('child_process');
    const pathModule = await import('path');
    const fsModule = await import('fs');
    const urlModule = await import('url');
    
    const __filename = urlModule.fileURLToPath(import.meta.url);
    const __dirname = pathModule.dirname(__filename);
    
    const pythonScriptPath = pathModule.default.join(__dirname, 'analysis_voice_camera.py');
    const outputFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}.json`);
    const stopFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_stop.txt`);
    
    console.log(`[Voice Analysis] === START REQUEST FOR INTERVIEW ${interviewId} ===`);
    console.log(`[Voice Analysis] Python script path: ${pythonScriptPath}`);
    console.log(`[Voice Analysis] Script exists: ${fsModule.default.existsSync(pythonScriptPath)}`);
    
    if (!fsModule.default.existsSync(pythonScriptPath)) {
      console.error('[Voice Analysis] Python script NOT FOUND!');
      return res.status(500).json({ message: 'Python analysis script not found' });
    }
    
    const pythonProcess = spawn('python', [
      pythonScriptPath,
      '--output', outputFilePath,
      '--duration', '300',
      '--stop-file', stopFilePath
    ], {
      cwd: __dirname,
      env: { ...process.env, DEBUG_VOICE_CAMERA: 'true' }
    });
    
    console.log(`[Voice Analysis] Process spawned with PID: ${pythonProcess.pid}`);
    
    // CRITICAL: Capture stderr (where Python logs go)
    pythonProcess.stderr.on('data', (data) => {
      const message = data.toString().trim();
      // Log Python output to Node.js console
      console.log(`[Voice Analysis] ${message}`);
    });
    
    // Also capture stdout (just in case)
    pythonProcess.stdout.on('data', (data) => {
      console.log(`[Voice Analysis] Python stdout: ${data.toString().trim()}`);
    });
    
    pythonProcess.on('error', (error: any) => {
      console.error('[Voice Analysis] Process error:', error);
      activeProcesses.delete(interviewId);
    });
    
    pythonProcess.on('exit', (code: any, signal: any) => {
      console.log(`[Voice Analysis] Process exited - Code: ${code}, Signal: ${signal}`);
      activeProcesses.delete(interviewId);
    });
    
    activeProcesses.set(interviewId, {
      process: pythonProcess,
      startTime: Date.now()
    });
    
    console.log(`[Voice Analysis] Process registered in activeProcesses map`);
    
    res.json({ 
      success: true, 
      message: 'Started voice and camera recording',
      processId: pythonProcess.pid
    });
  } catch (error) {
    console.error('[Voice Analysis] Error starting:', error);
    res.status(500).json({ message: 'Failed to start voice analysis' });
  }
});

app.post('/api/interviews/:interviewId/voice/stop', requireAuth, async (req: any, res) => {
  try {
    const interviewId = parseInt(req.params.interviewId);
    
    const interview = await storage.getInterview(interviewId);
    if (!interview || interview.userId !== req.user.id) {
      return res.status(404).json({ message: 'Interview not found' });
    }
    
    const processInfo = activeProcesses.get(interviewId);
    
    const fsModule = await import('fs');
    const pathModule = await import('path');
    const urlModule = await import('url');
    
    const __filename = urlModule.fileURLToPath(import.meta.url);
    const __dirname = pathModule.dirname(__filename);
    const outputFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}.json`);
    const stopFilePath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_stop.txt`);
    const completionFlagPath = pathModule.default.join(__dirname, `analysis_output_${interviewId}_completed.flag`);
    
    console.log(`[Voice Analysis] === STOP REQUEST FOR INTERVIEW ${interviewId} ===`);
    
    if (processInfo) {
      const { process } = processInfo;
      
      // Step 1: Create stop file to signal Python process
      console.log(`[Voice Analysis] Step 1: Creating stop file`);
      fsModule.default.writeFileSync(stopFilePath, 'stop');
      console.log(`[Voice Analysis] Stop file created: ${stopFilePath}`);
      
      // Step 2: Wait for Python process to complete cleanup
      console.log(`[Voice Analysis] Step 2: Waiting for Python cleanup (max 180 seconds)`);
      
      let waitTime = 0;
      const maxWaitTime = 180000; // 3 minutes for complete cleanup including Whisper
      const checkInterval = 1000; // Check every 1 second
      let cleanupCompleted = false;
      
      while (waitTime < maxWaitTime) {
        // Check if completion flag exists
        if (fsModule.default.existsSync(completionFlagPath)) {
          console.log(`[Voice Analysis] ✓ Completion flag detected after ${waitTime/1000}s`);
          cleanupCompleted = true;
          break;
        }
        
        // Check if process has exited
        if (process.exitCode !== null) {
          console.log(`[Voice Analysis] Process exited with code: ${process.exitCode}`);
          // Give a moment for file writes to complete
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        
        // Log progress every 10 seconds
        if (waitTime > 0 && waitTime % 10000 === 0) {
          console.log(`[Voice Analysis] Still waiting for cleanup... (${waitTime/1000}s elapsed)`);
        }
        
        await new Promise(resolve => setTimeout(resolve, checkInterval));
        waitTime += checkInterval;
      }
      
      if (!cleanupCompleted && waitTime >= maxWaitTime) {
        console.log(`[Voice Analysis] ⚠ Timeout after ${maxWaitTime/1000}s, forcing process termination`);
        try {
          process.kill('SIGTERM');
          // Wait 10 seconds for SIGTERM to take effect
          await new Promise(resolve => setTimeout(resolve, 10000));
        } catch (e) {
          console.log('[Voice Analysis] Process already exited or could not be killed:', e);
        }
      } else {
        console.log(`[Voice Analysis] ✓ Cleanup completed successfully`);
      }
      
      // Step 3: Clean up stop file and completion flag
      try {
        if (fsModule.default.existsSync(stopFilePath)) {
          fsModule.default.unlinkSync(stopFilePath);
          console.log(`[Voice Analysis] Removed stop file`);
        }
        if (fsModule.default.existsSync(completionFlagPath)) {
          fsModule.default.unlinkSync(completionFlagPath);
          console.log(`[Voice Analysis] Removed completion flag`);
        }
      } catch (e) {
        console.log('[Voice Analysis] Could not remove control files:', e);
      }
      
      activeProcesses.delete(interviewId);
      console.log(`[Voice Analysis] Process cleanup completed for interview ${interviewId}`);
    } else {
      console.log(`[Voice Analysis] No active process found for interview ${interviewId}`);
    }
    
    // Step 4: Read analysis results with smart retry logic
    let analysisData;
    console.log(`[Voice Analysis] Step 3: Reading analysis results from ${outputFilePath}`);
    
    // Wait a moment for final file writes
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    let fileExists = fsModule.default.existsSync(outputFilePath);
    console.log(`[Voice Analysis] File exists check: ${fileExists}`);
    
    if (!fileExists) {
      // Retry with exponential backoff (up to 30 seconds total)
      const retryIntervals = [1000, 2000, 3000, 4000, 5000, 5000, 5000, 5000]; // Total: 30s
      console.log(`[Voice Analysis] File not found, retrying with exponential backoff...`);
      
      for (let i = 0; i < retryIntervals.length; i++) {
        await new Promise(resolve => setTimeout(resolve, retryIntervals[i]));
        
        if (fsModule.default.existsSync(outputFilePath)) {
          fileExists = true;
          console.log(`[Voice Analysis] ✓ File found after retry ${i+1}`);
          // Give additional time for file to be fully written
          await new Promise(resolve => setTimeout(resolve, 2000));
          break;
        }
        
        console.log(`[Voice Analysis] Retry ${i+1}/${retryIntervals.length}: File still not found`);
      }
    }
    
    if (fileExists) {
      try {
        console.log(`[Voice Analysis] Reading output file...`);
        const rawData = fsModule.default.readFileSync(outputFilePath, 'utf8');
        console.log(`[Voice Analysis] File size: ${rawData.length} bytes`);
        
        if (!rawData || rawData.trim().length === 0) {
          console.log(`[Voice Analysis] ⚠ Output file is empty`);
          throw new Error('Empty output file');
        }
        
        analysisData = JSON.parse(rawData);
        console.log(`[Voice Analysis] ✓ Successfully parsed analysis data`);
        console.log(`[Voice Analysis] - Transcript length: ${analysisData.transcript?.length || 0}`);
        console.log(`[Voice Analysis] - Frames collected: ${analysisData.frames_collected || 0}`);
        console.log(`[Voice Analysis] - Data quality: ${analysisData.data_quality || 'unknown'}`);
        
        // Cleanup output file and audio file
        try {
          fsModule.default.unlinkSync(outputFilePath);
          console.log(`[Voice Analysis] Cleaned up JSON file`);
          
          const wavFile = outputFilePath.replace('.json', '.wav');
          if (fsModule.default.existsSync(wavFile)) {
            fsModule.default.unlinkSync(wavFile);
            console.log(`[Voice Analysis] Cleaned up WAV file`);
          }
        } catch (e) {
          console.log(`[Voice Analysis] Warning: Could not cleanup files:`, e);
        }
      } catch (parseError) {
        console.log(`[Voice Analysis] ✗ Error reading/parsing output file:`, parseError);
        
        // Use default data as fallback
        analysisData = {
          transcript: '',
          dominant_emotion: 'neutral',
          eye_contact_pct: 0.5,
          head_movement_std: 0.5,
          avg_posture_score: 0.5,
          data_quality: 'very_low',
          frames_collected: 0
        };
      }
    } else {
      console.log(`[Voice Analysis] ✗ Output file not found after all retries`);
      
      // Check for checkpoint file as last resort
      const checkpointPath = outputFilePath.replace('.json', '_checkpoint.json');
      if (fsModule.default.existsSync(checkpointPath)) {
        console.log(`[Voice Analysis] Found checkpoint file, using partial data`);
        try {
          const checkpointData = JSON.parse(fsModule.default.readFileSync(checkpointPath, 'utf8'));
          analysisData = {
            transcript: '',
            dominant_emotion: 'neutral',
            eye_contact_pct: 0.5,
            head_movement_std: 0.5,
            avg_posture_score: 0.5,
            data_quality: 'very_low',
            frames_collected: checkpointData.frames_processed || 0,
            note: 'Partial data from checkpoint'
          };
          
          // Cleanup checkpoint file
          fsModule.default.unlinkSync(checkpointPath);
        } catch (e) {
          console.log(`[Voice Analysis] Could not read checkpoint file:`, e);
        }
      }
      
      // Final fallback: use default data
      if (!analysisData) {
        console.log(`[Voice Analysis] Using default fallback data`);
        analysisData = {
          transcript: '',
          dominant_emotion: 'neutral',
          eye_contact_pct: 0.5,
          head_movement_std: 0.5,
          avg_posture_score: 0.5,
          data_quality: 'very_low',
          frames_collected: 0
        };
      }
    }
    
    // Step 5: Evaluate with Gemini
    console.log(`[Voice Analysis] Step 4: Evaluating with Gemini`);
    let geminiEvaluation = {
      score: 60,
      feedback: 'Response evaluated based on content and delivery.',
      suggestions: ['Maintain eye contact', 'Speak clearly', 'Provide specific examples']
    };
    
    if (analysisData.transcript && analysisData.transcript.trim().length > 20) {
      try {
        console.log(`[Voice Analysis] Calling Gemini for transcript evaluation...`);
        geminiEvaluation = await evaluateVoiceResponse('', analysisData.transcript, interview.role);
        console.log(`[Voice Analysis] ✓ Gemini evaluation complete: score ${geminiEvaluation.score}`);
      } catch (error) {
        console.error('[Voice Analysis] ✗ Gemini evaluation error:', error);
      }
    } else {
      console.log(`[Voice Analysis] Skipping Gemini (transcript too short: ${analysisData.transcript?.length || 0} chars)`);
    }
    
    // Step 6: Calculate final scores
    console.log(`[Voice Analysis] Step 5: Calculating final scores`);
    const eyeContactScore = analysisData.eye_contact_pct || 0.5;
    const emotionScore = ['happy', 'neutral', 'focused'].includes(analysisData.dominant_emotion) ? 1.0 : 0.7;
    const visualScore = (eyeContactScore * 0.6) + (emotionScore * 0.4);
    const postureScore = analysisData.avg_posture_score || 0.5;
    const geminiScore = geminiEvaluation.score / 100;
    const finalScore = Math.round(((0.6 * geminiScore) + (0.3 * visualScore) + (0.1 * postureScore)) * 100);
    
    console.log(`[Voice Analysis] Score breakdown:`);
    console.log(`  - Gemini: ${geminiEvaluation.score}/100 (60% weight)`);
    console.log(`  - Visual: ${Math.round(visualScore * 100)}/100 (30% weight)`);
    console.log(`  - Posture: ${Math.round(postureScore * 100)}/100 (10% weight)`);
    console.log(`  - Final: ${finalScore}/100`);
    
    console.log(`[Voice Analysis] === STOP REQUEST COMPLETED ===`);
    
    // Return comprehensive results
    res.json({
      transcript: analysisData.transcript || '',
      geminiScore: geminiEvaluation.score,
      geminiFeedback: geminiEvaluation.feedback,
      suggestions: geminiEvaluation.suggestions || [],
      dominantEmotion: analysisData.dominant_emotion || 'neutral',
      eyeContactPct: analysisData.eye_contact_pct || 0.5,
      headMovementStd: analysisData.head_movement_std || 0.5,
      postureScore: analysisData.avg_posture_score || 0.5,
      visualScore: Math.round(visualScore * 100),
      finalScore,
      emotionLog: analysisData.emotion_log || [],
      dataQuality: analysisData.data_quality || 'unknown',
      framesCollected: analysisData.frames_collected || 0,
      analysisNote: analysisData.note || ''
    });
  } catch (error) {
    console.error('[Voice Analysis] ✗ Fatal error in stop endpoint:', error);
    res.status(500).json({ message: 'Failed to stop voice analysis' });
  }
});

app.get('/api/interviews/:interviewId/voice/status', requireAuth, async (req: any, res) => {
  try {
    const interviewId = parseInt(req.params.interviewId);
    
    const interview = await storage.getInterview(interviewId);
    if (!interview || interview.userId !== req.user.id) {
      return res.status(404).json({ message: 'Interview not found' });
    }
    
    const processInfo = activeProcesses.get(interviewId);
    
    res.json({ 
      active: !!processInfo,
      startTime: processInfo?.startTime || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to check status' });
  }
});

  // ==================== MISC ROUTES ====================

  app.post('/api/transcribe', requireAuth, upload.single('audio'), async (req: any, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No audio file provided' });
      }

      const transcript = await transcribeAudio(req.file.path);
      
      res.json({ 
        success: true, 
        transcript: transcript.trim(),
        message: 'Audio transcribed successfully'
      });
    } catch (error) {
      console.error('Transcription error:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Failed to transcribe audio'
      });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}