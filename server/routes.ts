import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { verifyFirebaseToken } from "./services/firebase";
import { 
  generateMCQQuestions, 
  generateCodingQuestion, 
  generateVoiceQuestion,
  evaluateMCQAnswer,
  evaluateVoiceResponse,
  generateInterviewFeedback,
  textToSpeech
} from "./services/gemini";
import { transcribeAudio } from "./services/whisper";
import { executeCode } from "./services/judge0";
import { insertUserSchema, insertInterviewSchema, insertQuestionSchema, insertResponseSchema } from "@shared/schema";

export async function registerRoutes(app: Express): Promise<Server> {
  
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

      res.json({ user });
    } catch (error) {
      console.error('Auth verification error:', error);
      res.status(401).json({ error: 'Invalid token' });
    }
  });

  // Interview routes
  app.post('/api/interviews', requireAuth, async (req: any, res) => {
    try {
      const validated = insertInterviewSchema.parse({
        ...req.body,
        userId: req.user.id,
      });

      const interview = await storage.createInterview(validated);
      
      // Generate MCQ questions for stage 1
      const mcqQuestions = await generateMCQQuestions(interview.role, interview.experienceLevel, 5);
      
      for (const mcq of mcqQuestions) {
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 1,
          type: 'mcq',
          question: mcq.question,
          options: mcq.options,
          correctAnswer: mcq.correctAnswer,
          aiGenerated: true,
        });
      }

      // Generate coding question for stage 2 (if technical role)
      const technicalRoles = ['software engineer', 'developer', 'data scientist', 'sre', 'devops'];
      const isTechnical = technicalRoles.some(role => 
        interview.role.toLowerCase().includes(role.toLowerCase())
      );

      if (isTechnical) {
        const codingQuestion = await generateCodingQuestion(interview.role, interview.experienceLevel);
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify(codingQuestion),
          testCases: codingQuestion.testCases,
          aiGenerated: true,
        });
      }

      res.json(interview);
    } catch (error) {
      console.error('Error creating interview:', error);
      res.status(400).json({ message: 'Failed to create interview' });
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
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
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

  // Question routes
  app.get('/api/interviews/:interviewId/questions', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.interviewId));
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
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

      const existingQuestions = await storage.getQuestionsByInterviewId(interview.id);
      const voiceQuestions = existingQuestions
        .filter(q => q.stage === 3)
        .map(q => q.question);

      const question = await generateVoiceQuestion(interview.role, interview.experienceLevel, voiceQuestions);
      
      const createdQuestion = await storage.createQuestion({
        interviewId: interview.id,
        stage: 3,
        type: 'voice',
        question,
        aiGenerated: true,
      });

      // Generate TTS for the question
      const audioText = await textToSpeech(question);

      res.json({ ...createdQuestion, audioText });
    } catch (error) {
      console.error('Error generating voice question:', error);
      res.status(500).json({ message: 'Failed to generate voice question' });
    }
  });

  // Response routes
  app.post('/api/responses', requireAuth, async (req: any, res) => {
    try {
      const { questionId, answer, audioBlob } = req.body;
      
      const question = await storage.getQuestion(questionId);
      if (!question) {
        return res.status(404).json({ message: 'Question not found' });
      }

      const interview = await storage.getInterview(question.interviewId);
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

      if (question.type === 'mcq') {
        evaluation = await evaluateMCQAnswer(question.question, finalAnswer, question.correctAnswer || '');
      } else if (question.type === 'voice') {
        const voiceEval = await evaluateVoiceResponse(question.question, finalAnswer, interview.role);
        evaluation = {
          score: voiceEval.score,
          isCorrect: voiceEval.score >= 70,
          feedback: voiceEval.feedback,
          suggestions: voiceEval.suggestions,
        };
      }

      const response = await storage.createResponse({
        questionId,
        interviewId: question.interviewId,
        answer: finalAnswer,
        audioUrl,
        transcription,
        isCorrect: evaluation.isCorrect,
        score: evaluation.score,
        feedback: evaluation,
      });

      res.json(response);
    } catch (error) {
      console.error('Error creating response:', error);
      res.status(500).json({ message: 'Failed to create response' });
    }
  });

  // Code execution route
  app.post('/api/code/execute', requireAuth, async (req: any, res) => {
    try {
      const { code, language, testCases } = req.body;
      
      const result = await executeCode(code, language, testCases);
      res.json(result);
    } catch (error) {
      console.error('Error executing code:', error);
      res.status(500).json({ message: 'Failed to execute code' });
    }
  });

  // Interview completion and feedback
  app.post('/api/interviews/:id/complete', requireAuth, async (req: any, res) => {
    try {
      const interview = await storage.getInterview(parseInt(req.params.id));
      if (!interview || interview.userId !== req.user.id) {
        return res.status(404).json({ message: 'Interview not found' });
      }

      const responses = await storage.getResponsesByInterviewId(interview.id);
      const feedback = await generateInterviewFeedback(responses, interview.role, interview.experienceLevel);

      const updatedInterview = await storage.updateInterview(interview.id, {
        status: 'completed',
        completedAt: new Date(),
        overallScore: feedback.overallScore,
        feedback: feedback,
      });

      res.json(updatedInterview);
    } catch (error) {
      console.error('Error completing interview:', error);
      res.status(500).json({ message: 'Failed to complete interview' });
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

  const httpServer = createServer(app);
  return httpServer;
}
