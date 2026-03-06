import 'dotenv/config';
import { GoogleGenerativeAI, HarmBlockThreshold, HarmCategory } from '@google/generative-ai';

// --- Interfaces ---
export interface MCQQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  stage: number;
  type: string;
}

export interface CodingQuestion {
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
  stage: number;
  type: string;
}

// --- API Key Rotation Setup ---
// --- API Key Loading ---
const GEMINI_API_KEYS = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys: string[] = GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
if (apiKeys.length === 0) {
  throw new Error('No Gemini API keys found. Ensure GEMINI_API_KEYS="key1,key2,key3" in .env');
}

let currentKeyIndex = 0;

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

async function rotateKey(): Promise<void> {
  const previousIndex = currentKeyIndex;
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
  
  console.warn(`🔁 [Rotation] Switching Key: ${previousIndex} -> ${currentKeyIndex}`);

  // If we've circled through all 3 keys, we take a 15s "breath" 
  // to let the first key's 60-second window start resetting.
  if (currentKeyIndex === 0) {
    console.warn("⏳ Full cycle complete. Cooling down for 15s...");
    await sleep(15000); 
  } else {
    // 2s pause to prevent rapid-fire triggers across keys from the same IP
    await sleep(2000); 
  }
}

// --- Model and Safety Settings ---
function getTextOnlyModel() {
  // Use the verified 2.5-flash model
  return getGenAI().getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    safetySettings
  });
}
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

// --- Utility function for JSON parsing (improved robustness) ---
function extractAndParseJson<T>(content: string): T {
  let jsonMatch = content.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (jsonMatch) {
    try {
      return JSON.parse(jsonMatch[0]) as T;
    } catch (e) {}
  }
  const firstChar = content.indexOf('{') !== -1 ? content.indexOf('{') : content.indexOf('[');
  const lastChar = content.lastIndexOf('}') !== -1 ? content.lastIndexOf('}') : content.lastIndexOf(']');
  if (firstChar !== -1 && lastChar !== -1 && lastChar > firstChar) {
    const jsonStr = content.substring(firstChar, lastChar + 1);
    try {
      return JSON.parse(jsonStr) as T;
    } catch (e) {
      throw new Error('Failed to parse JSON from model response');
    }
  }
  throw new Error('No valid JSON found in model response');
}

// --- API Functions using Gemini with Key Rotation and Retry for 503 ---
async function withKeyRotation<T>(operation: (model: any) => Promise<T>): Promise<T> {
  const maxAttempts = apiKeys.length * 2; 
  let attempt = 0;

  while (attempt < maxAttempts) {
    // Re-initialize with the CURRENT key
    const genAI = new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash", // Strictly this name
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });

    try {
      return await operation(model);
    } catch (err: any) {
      attempt++;
      const status = err?.status || err?.statusCode || 500;
      
      console.error(`⚠️ Key ${currentKeyIndex} failed with Status ${status}`);

      // If it's a Rate Limit (429) or IP/Region block (403)
      if (status === 429 || status === 403) {
        currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
        console.warn(`🔄 Rotating to Key ${currentKeyIndex}... Cooling down for 3s.`);
        await sleep(3000);
        continue;
      }

      // If it's a 400, your prompt or model name is likely the issue
      if (status === 400) {
        console.error("❌ 400 Error: Check your model name or prompt structure.");
        throw err;
      }

      throw err;
    }
  }
  throw new Error("💀 API Exhaustion: All keys failed multiple times.");
}

export async function generateVoiceQuestion(
  role: string,
  experienceLevel: string,
  previousQuestions: string[] = [],
  previousQA: Array<{ question: string; answer: string }> = [],
  isRetry: boolean = false
): Promise<string> {
  return withKeyRotation(async () => {
    const normalize = (s: string) =>
      s.toLowerCase()
        .replace(/[`"'“”‘’]/g, '')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const normalizedPrev = previousQuestions.map(normalize);

    let context = '';
    if (previousQA && previousQA.length > 0) {
      const qaLines = previousQA
        .map((qa, i) => `Q${i + 1}: ${qa.question}\nA${i + 1}: ${qa.answer}`)
        .join('\n');
      context = `Previous Q&A:\n${qaLines}\n`;
    }

    const duplicatePrevention =
      previousQuestions.length > 0
        ? `\nIMPORTANT — AVOID DUPLICATES:\n- Do NOT repeat or paraphrase any of these questions:\n${previousQuestions
            .map((q, i) => `${i + 1}. ${q}`)
            .join('\n')}\n- Produce a question that is semantically distinct.\n`
        : '';

    const guardrails = `Style & Constraints:
- One clear, single question (no lists, no multiple questions in one).
- Max ~30 words; specific and actionable.
- Tie to prior answers where relevant; otherwise progress naturally (e.g., deeper, adjacent topic, practical scenario).
- Prefer STAR prompts (“Tell me about a time…”) OR focused probes (trade-offs, debugging steps, design choices) based on ${role}.`;

    const retryInstructions = isRetry ? `
CRITICAL RETRY INSTRUCTIONS:
- The previous question was a duplicate. Generate a COMPLETELY DIFFERENT question.
- Use a different approach, angle, or topic area.
- If the previous was about experience, ask about challenges.
- If the previous was about skills, ask about projects.
- If the previous was about background, ask about future goals.
- Be creative and avoid any similarity to previous questions.
` : '';

    const prompt = `${context}${duplicatePrevention}${retryInstructions}You are an AI interviewer conducting a voice-based mock interview for a ${role}.
Generate the next follow-up question based on the candidate’s previous answers and a realistic interview flow.

CRITICAL REQUIREMENTS:
1) Do NOT repeat or paraphrase previous questions (semantic duplicates are not allowed)
2) Make the question contextually relevant to their prior answers
3) Progress the interview naturally (deeper probe, adjacent competency, or practical scenario)
4) Ask for specific examples or deeper explanations when appropriate

${guardrails}

Role: ${role}
Experience Level: ${experienceLevel}

Return only the next question as plain text (no quotes, no bullets).`;

    console.log('🎤 Generating voice question with context:', {
      role,
      experienceLevel,
      previousQACount: previousQA.length,
      previousQuestionsCount: previousQuestions.length,
      context: context.substring(0, 200) + '...',
    });

    const model = getTextOnlyModel();

    // Small helper to normalize model outputs
    const clean = (s: string) =>
      s
        .trim()
        .replace(/^["'`]+|["'`]+$/g, '') // strip surrounding quotes/backticks
        .replace(/\s+/g, ' ')
        .trim();

    // Simple similarity check (token overlap ratio)
    const isDuplicateish = (q: string) => {
      const nq = normalize(q);
      if (!nq) return true;
      return normalizedPrev.some((p) => {
        if (!p) return false;
        const pa = new Set(p.split(' '));
        const qa = nq.split(' ');
        const common = qa.filter((w) => pa.has(w)).length;
        const overlap = common / Math.max(qa.length, 1);
        // Tune threshold: 0.6 is moderately strict; adjust if needed
        return overlap >= 0.6 || nq.includes(p) || p.includes(nq);
      });
    };

    // Generate with at most one retry if duplicate-ish
    const generateOnce = async (extraNudge?: string) => {
    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: extraNudge ? `${prompt}\n\n${extraNudge}` : prompt }] }],
      safetySettings,
    });
    const response = await result.response;
      return clean(response.text());
    };

    let question = await generateOnce();
    if (isDuplicateish(question)) {
      console.log('♻️ Detected semantic duplicate, retrying with stronger nudge...', question);
      question = await generateOnce(
        'Reminder: The next question must be meaningfully different from all previous ones and must not paraphrase them. Choose a new angle.'
      );
    }

    console.log('🎤 Generated voice question:', question.substring(0, 100) + '...');
    return question;
  });
}


export async function evaluateMCQAnswer(
  question: string,
  selectedAnswer: string,
  correctAnswer: string
): Promise<{ isCorrect: boolean; feedback: string; score: number }> {
  return withKeyRotation(async () => {
    const prompt = `Evaluate this MCQ answer:
Question: ${question}
Selected Answer: ${selectedAnswer}
Correct Answer: ${correctAnswer}
Provide feedback and a score (0-100). Response format: {"isCorrect": boolean, "feedback": "Detailed explanation of why the answer is correct/incorrect", "score": number}. Ensure the JSON is well-formed and directly parsable.`;
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await result.response;
    const jsonResponseText = response.text();
    return extractAndParseJson<{ isCorrect: boolean; feedback: string; score: number }>(jsonResponseText);
  });
}

export async function evaluateVoiceResponse(
  question: string,
  responseText: string,
  role: string
): Promise<{ score: number; feedback: string; suggestions: string[] }> {
  return withKeyRotation(async () => {
    const prompt = `You are an AI interviewer evaluating a candidate's response.\nCurrent Question: ${question}\nCandidate's Response: ${responseText}\nRole: ${role}\n\nEvaluate the candidate's response to the current question. Provide a score (0-100) and detailed feedback with specific suggestions for improvement. Response format: {"score": number, "feedback": "Detailed feedback on the response", "suggestions": ["Suggestion 1", "Suggestion 2"]}. Ensure the JSON is well-formed and directly parsable.`;
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await result.response;
    const jsonResponseText = response.text();
    return extractAndParseJson<{ score: number; feedback: string; suggestions: string[] }>(jsonResponseText);
  });
}

export async function generateInterviewFeedback(
  responses: any[],
  role: string,
  experienceLevel: string
): Promise<any> {
  return withKeyRotation(async () => {
    const grouped: Record<string, any[]> = {};
    for (const r of responses) {
      if (!grouped[r.questionId]) grouped[r.questionId] = [];
      grouped[r.questionId].push(r);
    }
    const bestResponses = responses.map(r => {
      if (r.type === 'coding') {
        const allAttempts = grouped[r.questionId].filter((x: any) => x.type === 'coding');
        const best = allAttempts.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), allAttempts[0]);
        return best;
      }
      return r;
    });
    const uniqueBestResponses = Object.values(
      bestResponses.reduce((acc, r) => {
        acc[r.questionId] = r;
        return acc;
      }, {} as Record<string, any>)
    );
    const mcqResponses = uniqueBestResponses.filter((r: any) => r.type === 'mcq');
    const codingResponses = uniqueBestResponses.filter((r: any) => r.type === 'coding');
    const voiceResponses = uniqueBestResponses.filter((r: any) => r.type === 'voice');
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const mcqScore = avg(mcqResponses.map((r: any) => r.score || 0));
    const codingScore = avg(codingResponses.map((r: any) => r.score || 0));
    const voiceScore = avg(voiceResponses.map((r: any) => r.score || 0));
    const overallScore = Math.round((mcqScore * 0.4) + (codingScore * 0.4) + (voiceScore * 0.2));
    const communicationSkills = Math.round(voiceScore);
    const technicalSkills = Math.round((mcqScore + codingScore) / 2);
    const confidence = Math.round((voiceScore + mcqScore) / 2);
    const prompt = `You are an AI interview assistant. Given the following interview context, generate qualitative feedback only (do NOT invent or recalculate any scores).
Role: ${role}
Experience Level: ${experienceLevel}
Scores: {overallScore: ${overallScore}, communicationSkills: ${communicationSkills}, technicalSkills: ${technicalSkills}, confidence: ${confidence}}
Responses: ${JSON.stringify(uniqueBestResponses)}
Provide:
- Key strengths (array)
- Areas for improvement (array)
- Recommendations (array)
- Detailed feedback summary (string).
Response format: {"strengths": ["...", "..."], "weaknesses": ["...", "..."], "recommendations": ["...", "..."], "detailedFeedback": "..."}. Ensure the JSON is well-formed and directly parsable.`;
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await result.response;
    const jsonResponseText = response.text();
    const feedback = extractAndParseJson<any>(jsonResponseText);
    return {
      overallScore,
      communicationSkills,
      technicalSkills,
      confidence,
      strengths: feedback.strengths || [],
      weaknesses: feedback.weaknesses || [],
      recommendations: feedback.recommendations || [],
      detailedFeedback: feedback.detailedFeedback || '',
    };
  });
}

export async function analyzeResumeWithGemini(
  resumeText: string
): Promise<{ 
    role: string | null; 
    experienceLevel: string | null; 
    skills?: string[]; 
    name?: string; 
    email?: string;
    education?: string;
    experience?: string;
    projects?: string;
    certifications?: string;
  }> {
  return withKeyRotation(async () => {
    const prompt = `Analyze the following document. If it is a resume, extract comprehensive information including:
- role: most suitable interview role
- experienceLevel: experience level (e.g., "Entry Level 0-2 years", "Mid Level 3-5 years", "Senior Level 5+ years")
- skills: array of technical skills
- name: candidate's name
- email: candidate's email
- education: educational background and degrees (extract full details)
- experience: work experience summary (extract full details)
- projects: notable projects and achievements (extract full details)
- certifications: relevant certifications (extract full details)

IMPORTANT: For education, experience, projects, and certifications, extract the FULL text content, not just summaries. These fields should contain the complete information as it appears in the resume.

If it is NOT a resume, respond with: { "role": null, "experienceLevel": null, "skills": [] }.

Return a JSON object with all the above fields. If a field is not found, return null or an empty array as appropriate. Ensure the JSON is well-formed and directly parsable.

Resume:
${resumeText}`;
    
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await result.response;
    const jsonResponseText = response.text();
    const parsedResponse = extractAndParseJson<{ 
      role: string | null; 
      experienceLevel: string | null; 
      skills?: string[]; 
      name?: string; 
      email?: string;
      education?: string;
      experience?: string;
      projects?: string;
      certifications?: string;
    }>(jsonResponseText);
    
    // Normalize skills array
    if (parsedResponse.skills && !Array.isArray(parsedResponse.skills)) {
      parsedResponse.skills = [String(parsedResponse.skills)];
    } else if (!parsedResponse.skills) {
      parsedResponse.skills = [];
    }
    
    return parsedResponse;
  });
}

export async function generateMCQQuestions(
  role: string,
  experienceLevel: string,
  count: number = 5
): Promise<MCQQuestion[]> {
  return withKeyRotation(async () => {
    const difficultyPrompt = getMCQDifficultyPrompt(experienceLevel);
    const prompt = `Generate ${count} multiple choice questions for a ${experienceLevel} level ${role} interview.

${difficultyPrompt}

CRITICAL REQUIREMENTS:
- Each question must require multi-step reasoning or deep understanding
- Avoid basic definitions, syntax, or memorization questions
- Focus on problem-solving, trade-offs, and real-world scenarios
- Options should be plausible but have clear technical distinctions
- For code output questions: ALWAYS include the complete code snippet in the question field using proper code formatting

Examples of FORBIDDEN easy questions:
- "What does HTML stand for?"
- "Which method adds an element to an array?"
- "What is the time complexity of linear search?"

Examples of REQUIRED challenging questions:
- Scenario-based debugging problems
- Algorithm optimization choices
- System design trade-offs
- Code output prediction with edge cases (MUST include complete code)

IMPORTANT: For any question involving code analysis or output prediction:
- Include the COMPLETE code snippet in the question field
- Use proper code blocks with triple backticks
- Ensure the code is syntactically correct and executable
- The question should be self-contained with all necessary code

Return JSON array with exactly this structure:
[
  {
    "question": "Problem description followed by code example using triple backticks for code blocks. What will be the output?",
    "options": ["Detailed option A with reasoning", "Detailed option B", "Detailed option C", "Detailed option D"],
    "correctAnswer": "Must exactly match one option",
    "explanation": "Why this answer is correct and why others are wrong - include technical reasoning",
    "stage": 1,
    "type": "mcq"
  }
]`;

    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });

    const response = await result.response;
    const jsonResponseText = response.text();
    const questions = extractAndParseJson<MCQQuestion[]>(jsonResponseText);

    // Validate and fix options format
    for (const q of questions) {
      if (q && typeof q.options === "string") {
        q.options = (q.options as string).split(",").map((opt: string) => opt.trim());
      }
      
      // Validate question complexity
      if (isQuestionTooEasy(q.question)) {
        console.warn('Generated question may be too easy:', q.question);
      }
      
      // Validate code questions include actual code
      if (mentionsCodeButMissingCode(q.question)) {
        console.warn('Question mentions code but missing code snippet:', q.question.substring(0, 100));
        // Try to fix or flag for regeneration
      }
    }

    return questions;
  });
}

function getMCQDifficultyPrompt(experienceLevel: string): string {
  switch (experienceLevel.toLowerCase()) {
    case 'entry level 0-2 years':
    case 'fresher':
    case 'entry':
      return `ENTRY LEVEL DIFFICULTY:
- Focus on practical problem-solving, not theory
- Questions should require understanding of algorithms, data structures, and debugging
- Include questions about time/space complexity analysis
- Add scenario-based questions about choosing appropriate data structures
- Include code output prediction with moderate complexity
- When including code: Use complete, executable code snippets in code format
- Minimum difficulty: LeetCode Easy-Medium level reasoning`;

    case 'mid level 3-5 years':
    case 'intermediate':
      return `INTERMEDIATE DIFFICULTY:
- Advanced algorithm design and optimization
- System design fundamentals and trade-offs
- Complex debugging scenarios with complete code examples
- Performance optimization questions
- Design pattern applications
- When including code: Use complete, executable code snippets in code format
- Minimum difficulty: LeetCode Medium level reasoning`;

    case 'senior level 5+ years':
    case 'senior':
    case 'advanced':
      return `SENIOR DIFFICULTY:
- Architecture and system design decisions
- Complex algorithmic problems with implementation details
- Performance at scale considerations
- Advanced debugging and optimization with complete code examples
- Leadership and technical decision-making scenarios
- When including code: Use complete, executable code snippets in code format
- Minimum difficulty: LeetCode Medium-Hard level reasoning`;

    default:
      return getMCQDifficultyPrompt('entry level 0-2 years');
  }
}

function isQuestionTooEasy(question: string): boolean {
  const easyPatterns = [
    /what does .+ stand for/i,
    /which of the following is/i,
    /what is the syntax/i,
    /define/i,
    /which method/i,
    /what keyword/i
  ];
  
  return easyPatterns.some(pattern => pattern.test(question));
}

function mentionsCodeButMissingCode(question: string): boolean {
  // Check if question mentions code
  const mentionsCode = /code snippet|following code|python code|javascript code|java code|c\+\+ code|consider.*code|output.*code/i.test(question);
  
  // Check if question actually contains code
  const hasVisibleCode = /```|`\w+`|def |function |class |import |#include|for\s+\w+\s+in|if\s+.*:|while\s+.*:/i.test(question);
  
  return mentionsCode && !hasVisibleCode;
}



export async function callGemini(prompt: string): Promise<string> {
  return withKeyRotation(async () => {
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "text/plain" },
    });
    const response = await result.response;
    return response.text().trim();
  });
} 