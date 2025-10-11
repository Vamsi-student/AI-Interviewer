import express from 'express';
import multer from 'multer';
import path from 'path';
import { storage } from '../storage';
import { generateVoiceQuestion, generateMCQQuestions } from '../services/gemini';
import { Request } from 'express';
import fs from 'fs';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import mammoth from 'mammoth';
import { analyzeResumeWithGemini } from '../services/gemini';
import { technicalRoles } from '../../shared/schema';
import Fuse from 'fuse.js';
import { verifyFirebaseToken } from '../services/firebase';
import { db } from '../db';
import { codingProblems } from '../../shared/schema';
import { eq } from 'drizzle-orm';

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

const router = express.Router();

const uploadsDir = path.join(process.cwd(), 'uploads');
const upload = multer({ dest: uploadsDir });

// Authentication middleware
const requireAuth = async (req: any, res: any, next: any) => {
  try {
    console.log('requireAuth middleware - headers:', req.headers);
    const token = req.headers.authorization?.replace('Bearer ', '');
    console.log('requireAuth middleware - token:', token);
    if (!token) {
      console.log('requireAuth middleware - No token provided');
      return res.status(401).json({ message: 'No token provided' });
    }

    // Handle demo mode
    if (token === 'demo-token') {
      try {
        let user = await storage.getUserByFirebaseUid('demo-user-123');
        if (!user) {
          user = await storage.createUser({
            firebaseUid: 'demo-user-123',
            email: 'demo@example.com',
            name: 'Demo User'
          });
        }
        console.log('requireAuth middleware - setting demo user:', user);
        req.user = user;
        return next();
      } catch (demoError) {
        console.error('Demo user creation failed:', demoError);
        return res.status(500).json({ message: 'Demo mode unavailable' });
      }
    }

    try {
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
      
      console.log('requireAuth middleware - setting user:', user);
      req.user = user;
      next();
    } catch (firebaseError) {
      console.error('Firebase token verification failed:', firebaseError);
      return res.status(401).json({ message: 'Invalid token' });
    }
  } catch (error) {
    console.error('requireAuth middleware - unexpected error:', error);
    return res.status(500).json({ message: 'Authentication error' });
  }
};

// Helper to extract text from PDF using pdfjs-dist
async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    if (!fs.existsSync(filePath)) {
      throw new Error(`PDF file not found: ${filePath}`);
    }
    
    const data = new Uint8Array(fs.readFileSync(filePath));
    if (data.length === 0) {
      throw new Error('PDF file is empty');
    }
    
    // ESM-compatible path resolution for standardFontDataUrl
    const standardFontDataUrl = new URL('../../node_modules/pdfjs-dist/standard_fonts/', import.meta.url).toString();
    const doc = await pdfjsLib.getDocument({
      data,
      standardFontDataUrl
    }).promise;
    
    let text = '';
    for (let i = 1; i <= doc.numPages; i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map((item: any) => item.str).join(' ') + '\n';
      } catch (pageError) {
        console.warn(`Failed to extract text from page ${i}:`, pageError);
        text += `[Page ${i} - Text extraction failed]\n`;
      }
    }
    
    if (!text.trim()) {
      throw new Error('No text could be extracted from PDF');
    }
    
    return text;
  } catch (error) {
    console.error('PDF extraction failed:', error);
    throw new Error(`PDF extraction failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Robust fuzzy technical role detection
 * @param extractedRole The role string extracted from resume
 * @returns boolean
 */
function isTechnicalRoleFuzzy(extractedRole: string | null | undefined): boolean {
  if (!extractedRole) return false;
  const fuse = new Fuse(technicalRoles, {
    includeScore: true,
    threshold: 0.4, // adjust for strictness
    keys: [],
  });
  const results = fuse.search(extractedRole.toLowerCase());
  if (results.length > 0 && results[0]?.score !== undefined && results[0]?.score <= 0.4) {
    return true;
  }
  return false;
}

// POST /api/resume/analyze
router.post('/analyze', upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.endsWith('.pdf')) {
      console.error('File is not a PDF:', req.file.mimetype, req.file.originalname);
      return res.status(400).json({ error: 'Only PDF files are allowed.' });
    }
    console.log('Uploaded file info:', req.file);
    const filePath = req.file.path;
    let resumeText = '';
    try {
      console.log('Starting PDF extraction:', filePath);
      resumeText = await extractTextFromPDF(filePath);
      console.log('PDF extraction complete. Text length:', resumeText.length);
    } catch (pdfErr) {
      console.error('PDF extraction failed:', pdfErr);
      throw pdfErr;
    }
    fs.unlink(filePath, () => {});
    let parsed;
    try {
      console.log('Starting Gemini analysis...');
      parsed = await analyzeResumeWithGemini(resumeText);
      console.log('Gemini analysis complete:', parsed);
      // Add robust technical role detection
      (parsed as any).isTechnicalRole = isTechnicalRoleFuzzy(parsed.role ?? '');
    } catch (aiErr) {
      console.error('Gemini analysis failed:', aiErr);
      throw aiErr;
    }
    if (!parsed.role ||
        !parsed.skills ||
        parsed.skills.length === 0 ||
        !parsed.experienceLevel ||
        ['student', 'unknown', 'n/a', 'none', 'null'].includes(String(parsed.role).toLowerCase())
    ) {
      console.error('Resume analysis missing required fields or detected non-resume role:', parsed);
      return res.status(400).json({ error: 'Please upload a resume. This does not appear to be a resume.' });
    }
    res.json(parsed);
  } catch (err) {
    if (err instanceof Error) {
      console.error('Error in /api/resume/analyze:', err.stack || err.message);
      res.status(500).json({ error: 'Failed to analyze resume', details: err.stack || err.message });
    } else {
      console.error('Error in /api/resume/analyze:', err);
      res.status(500).json({ error: 'Failed to analyze resume', details: err });
    }
  }
});

// POST /api/resume/from-resume
router.post('/from-resume', requireAuth, upload.single('resume'), async (req, res) => {
  console.log('🔍 Resume upload route hit - req.user:', (req as any).user);
  let uploadedFilePath: string | null = null;
  
  try {
    console.log('Resume upload started');
    
    if (!req.file) {
      console.error('No file uploaded');
      return res.status(400).json({ error: 'No file uploaded' });
    }
    
    if (req.file.mimetype !== 'application/pdf' && !req.file.originalname.endsWith('.pdf')) {
      console.error('Invalid file type:', req.file.mimetype, req.file.originalname);
      return res.status(400).json({ error: 'Only PDF files are allowed.' });
    }
    
    uploadedFilePath = req.file.path;
    console.log('File uploaded to:', uploadedFilePath);
    
    // Extract text from PDF
    let resumeText = '';
    try {
      resumeText = await extractTextFromPDF(uploadedFilePath);
      console.log('PDF text extracted, length:', resumeText.length);
    } catch (pdfError) {
      console.error('PDF extraction failed:', pdfError);
      return res.status(400).json({ error: 'Failed to extract text from PDF. Please ensure it\'s a valid PDF file.' });
    } finally {
      // Clean up uploaded file
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        fs.unlink(uploadedFilePath, (err) => {
          if (err) console.error('Failed to delete uploaded file:', err);
        });
      }
    }
    
    // Analyze with Gemini
    let ollamaExtracted;
    try {
      ollamaExtracted = await analyzeResumeWithGemini(resumeText);
      console.log('Gemini analysis completed');
    } catch (geminiError) {
      console.error('Gemini analysis failed:', geminiError);
      return res.status(500).json({ error: 'Failed to analyze resume. Please try again.' });
    }
    
    // Add robust technical role detection
    (ollamaExtracted as any).isTechnicalRole = isTechnicalRoleFuzzy(ollamaExtracted.role ?? '');
    
    if (!ollamaExtracted.role || !ollamaExtracted.skills || ollamaExtracted.skills.length === 0 || !ollamaExtracted.experienceLevel) {
      console.error('Resume analysis missing required fields:', ollamaExtracted);
      return res.status(400).json({ error: 'Please upload a resume. This does not appear to be a resume.' });
    }
    
    if (!ollamaExtracted.role || !ollamaExtracted.experienceLevel) {
      console.error('Gemini could not infer role or experience level');
      return res.status(400).json({ error: 'Gemini could not infer role or experience level' });
    }
    
    // Get the authenticated user's ID from the request
    console.log('DEBUG createInterview userId:', (req as any).user.id);
    const userId = (req as any).user?.id;
    
    if (!userId) {
      console.log('Resume upload - No userId found, returning 401');
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Create interview
    let interview;
    try {
      interview = await storage.createInterview({
        userId,
        role: ollamaExtracted.role,
        experienceLevel: ollamaExtracted.experienceLevel,
        currentStage: 1,
        status: 'in_progress',
      });
      console.log('Interview created:', interview.id);
    } catch (interviewError) {
      console.error('Failed to create interview:', interviewError);
      return res.status(500).json({ error: 'Failed to create interview. Please try again.' });
    }
    
    // Generate MCQ questions
    try {
      const mcqs = await generateMCQQuestions(ollamaExtracted.role, ollamaExtracted.experienceLevel, 5);
      console.log('MCQ questions generated:', mcqs.length);
      
      for (const mcq of mcqs) {
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 1,
          type: 'mcq',
          question: mcq.question,
          options: mcq.options || [],
          correctAnswer: mcq.correctAnswer || '',
          aiGenerated: true,
          testCases: [],
        });
      }
    } catch (mcqError) {
      console.error('Failed to generate MCQ questions:', mcqError);
      // Continue with other questions
    }
    
    // Generate coding question from database
    try {
      // Fetch coding problem from database for ALL roles (not just technical)
      const problems = await db.select().from(codingProblems)
        .where(eq(codingProblems.problemHardnessLevel, mapExperienceToDifficulty(ollamaExtracted.experienceLevel!)))
        .limit(5);
      
      let selectedProblem = null;
      if (problems.length === 0) {
        // Fallback to any available problem if no match found
        const fallbackProblems = await db.select().from(codingProblems).limit(5);
        selectedProblem = fallbackProblems.length > 0 ? fallbackProblems[Math.floor(Math.random() * fallbackProblems.length)] : null;
      } else {
        // Select a random problem from the matching hardness level
        selectedProblem = problems[Math.floor(Math.random() * problems.length)];
      }
      
      if (selectedProblem) {
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 2,
          type: 'coding',
          question: JSON.stringify({
            title: selectedProblem.problemTitle,
            description: selectedProblem.problemDescription,
            constraints: selectedProblem.constraints,
            examples: selectedProblem.examples,
            problemId: selectedProblem.id
          }),
          testCases: selectedProblem.testCases || [],
          aiGenerated: false,
          options: [],
          correctAnswer: '',
        });
        console.log('Database coding question created:', selectedProblem.problemTitle);
      } else {
        console.warn('No coding problems found in database');
      }
    } catch (codingError) {
      console.error('Failed to create coding question from database:', codingError);
      // Continue with voice question
    }
    
    // Generate voice question
    try {
      const voiceQ = await generateVoiceQuestion(ollamaExtracted.role, ollamaExtracted.experienceLevel, []);
      if (voiceQ) {
        await storage.createQuestion({
          interviewId: interview.id,
          stage: 3,
          type: 'voice',
          question: voiceQ,
          aiGenerated: true,
          options: [],
          correctAnswer: '',
          testCases: [],
        });
        console.log('Voice question created');
      }
    } catch (voiceError) {
      console.error('Failed to generate voice question:', voiceError);
      // Continue anyway
    }
    
    console.log('Resume upload completed successfully');
    res.json(interview);
    
  } catch (err) {
    console.error('Resume upload - unexpected error:', err);
    
    // Clean up uploaded file if it exists
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
      fs.unlink(uploadedFilePath, (unlinkErr) => {
        if (unlinkErr) console.error('Failed to delete uploaded file during error cleanup:', unlinkErr);
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to create interview from resume', 
      details: err instanceof Error ? err.message : 'Unknown error' 
    });
  }
});

export default router;