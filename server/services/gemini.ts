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
const GEMINI_API_KEYS = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
const apiKeys: string[] = GEMINI_API_KEYS.split(',').map(k => k.trim()).filter(Boolean);
if (apiKeys.length === 0) {
  throw new Error('No Gemini API keys configured. Please set GEMINI_API_KEYS or GEMINI_API_KEY as an environment variable.');
}
let currentKeyIndex = 0;

function getGenAI(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(apiKeys[currentKeyIndex]);
}
function rotateKey(): void {
  currentKeyIndex = (currentKeyIndex + 1) % apiKeys.length;
}

// --- Model and Safety Settings ---
function getTextOnlyModel() {
  return getGenAI().getGenerativeModel({ model: 'gemini-2.0-flash' });
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
async function withKeyRotation<T>(fn: () => Promise<T>): Promise<T> {
  let attempts = 0;
  let lastError: any;
  const maxRetries = 3;
  while (attempts < apiKeys.length) {
    let retryCount = 0;
    while (retryCount < maxRetries) {
      try {
        return await fn();
      } catch (err: any) {
        // Retry on 503 Service Unavailable
        if (err && (err.status === 503 || err.statusCode === 503 || err.message?.includes('503'))) {
          const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
          if (retryCount < maxRetries - 1) {
            console.warn(`Gemini API 503 error, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
            await new Promise(res => setTimeout(res, delay));
            retryCount++;
            continue;
          }
        }
        if (err && (err.message?.includes('quota') || err.message?.includes('429') || err.code === 429)) {
          rotateKey();
          attempts++;
          lastError = err;
          break;
        }
        throw err;
      }
    }
    attempts++;
  }
  throw lastError || new Error('All Gemini API keys exhausted or failed.');
}

// --- DSA Topics for Coding Questions ---
const DSA_TOPICS = [
  'Arrays and Strings',
  'Linked Lists',
  'Stacks and Queues',
  'Trees and Graphs',
  'Recursion and Backtracking',
  'Searching and Sorting',
  'Dynamic Programming',
  'Greedy Algorithms',
  'Bit Manipulation',
  'Sliding Window',
  'Two Pointers'
];

function getDSAPrompt(experienceLevel: string) {
  const difficultySpec = getDifficultySpecification(experienceLevel);
  
  return `Generate a challenging DSA coding problem for ${experienceLevel} software engineering interview.

${difficultySpec}

PROBLEM REQUIREMENTS:
1. Must require algorithmic thinking, not just implementation
2. Should have at least 2-3 different approaches with different time complexities
3. Include edge cases that test understanding
4. Problem should take 20-45 minutes for the target level

FORBIDDEN PROBLEM TYPES:
- Simple array traversal (find max/min, reverse, etc.)
- Basic string manipulation (palindrome check, reverse string)
- Simple sorting problems
- Basic tree traversal without additional logic
- Simple mathematical calculations

REQUIRED PROBLEM CHARACTERISTICS:
- Multiple valid approaches with different trade-offs
- Edge cases that require careful consideration
- Optimal solution requires specific algorithmic insight
- Test cases should include boundary conditions

Choose from these ALGORITHMIC topics:
- Two Pointers (with sliding window complexity)
- Hash Tables (with collision handling or complex mapping)
- Binary Search (on answers or complex search spaces)
- Dynamic Programming (with optimal substructure)
- Graph Algorithms (DFS/BFS with complex conditions)
- Heap/Priority Queue (with custom comparisons)
- Stack/Queue (with complex state management)
- Recursion with Memoization
- Greedy Algorithms (with proof of correctness needed)

STRUCTURE:
{
  "title": "Descriptive problem name (4-8 words)",
  "description": "Detailed problem with clear input/output format and constraints",
  "difficulty": "${getDifficultyLevel(experienceLevel)}",
  "constraints": ["Technical constraints that affect algorithm choice"],
  "examples": [
    {"input": "Clear input format", "output": "Expected output", "explanation": "Why this output"}
  ],
  "testCases": [
    {"input": "Basic case", "expectedOutput": "Result"},
    {"input": "Edge case", "expectedOutput": "Result"}, 
    {"input": "Stress test", "expectedOutput": "Result"}
  ],
  "stage": 2,
  "type": "coding"
}

CRITICAL: Ensure the problem requires genuine algorithmic insight, not just coding ability.`;
}

function getDifficultySpecification(experienceLevel: string): string {
  switch (experienceLevel.toLowerCase()) {
    case 'entry level 0-2 years':
    case 'fresher':
      return `ENTRY LEVEL DIFFICULTY REQUIREMENTS:
- LeetCode Medium difficulty (not Easy!)
- Should require 1-2 key algorithmic insights
- Multiple approaches possible (brute force O(n²), optimal O(n log n) or O(n))
- Edge cases should test boundary understanding
- Examples: Two-sum variants, sliding window problems, basic DP
- Time to solve: 25-35 minutes for entry level
- Must NOT be solvable by simple iteration or basic logic`;

    case 'mid level 3-5 years':
      return `INTERMEDIATE DIFFICULTY REQUIREMENTS:
- LeetCode Medium-Hard difficulty
- Requires 2-3 algorithmic insights or techniques combined
- Multiple optimization levels (O(n²) → O(n log n) → O(n))
- Complex edge cases and corner conditions
- Examples: Advanced DP, graph algorithms, complex two-pointers
- Time to solve: 20-30 minutes for intermediate
- Should require deep understanding of data structures`;

    case 'senior level 5+ years':
      return `SENIOR DIFFICULTY REQUIREMENTS:
- LeetCode Hard difficulty
- Requires advanced algorithmic knowledge and optimization
- Multiple complex techniques combined
- Non-obvious edge cases and mathematical insights
- Examples: Advanced graph algorithms, complex DP with optimization, segment trees
- Time to solve: 15-25 minutes for senior (they should see patterns quickly)
- Should test algorithm design abilities, not just implementation`;

    default:
      return getDifficultySpecification('entry level 0-2 years');
  }
}

function getDifficultyLevel(experienceLevel: string): string {
  switch (experienceLevel.toLowerCase()) {
    case 'entry level 0-2 years':
    case 'fresher':
      return 'Medium';
    case 'mid level 3-5 years':
      return 'Medium-Hard';
    case 'senior level 5+ years':
      return 'Hard';
    default:
      return 'Medium';
  }
}

// Add validation for generated problems
function validateProblemDifficulty(problem: any, experienceLevel: string): boolean {
  const description = problem.description.toLowerCase();
  
  // Check for forbidden easy patterns
  const easyPatterns = [
    /find.*maximum/,
    /find.*minimum/,
    /reverse.*array/,
    /reverse.*string/,
    /check.*palindrome/,
    /sort.*array/,
    /count.*elements/,
    /sum.*elements/
  ];
  
  const isTooEasy = easyPatterns.some(pattern => pattern.test(description));
  
  if (isTooEasy) {
    console.warn(`Generated problem may be too easy for ${experienceLevel}:`, problem.title);
    return false;
  }
  
  // Check for required complexity indicators
  const complexityIndicators = [
    /optimize/,
    /efficient/,
    /multiple.*approach/,
    /time.*complexity/,
    /dynamic.*programming/,
    /algorithm/,
    /strategy/
  ];
  
  const hasComplexity = complexityIndicators.some(pattern => pattern.test(description));
  
  return hasComplexity;
}


export async function generateCodingQuestion(
  role: string,
  experienceLevel: string
): Promise<CodingQuestion> {
  return withKeyRotation(async () => {
    const prompt = getDSAPrompt(experienceLevel);
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "application/json" },
    });
    const response = await result.response;
    const jsonResponseText = response.text();
    return extractAndParseJson<CodingQuestion>(jsonResponseText);
  });
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
    const prompt = `Evaluate this MCQ answer:\nQuestion: ${question}\nSelected Answer: ${selectedAnswer}\nCorrect Answer: ${correctAnswer}\nProvide feedback and a score (0-100). Response format: {"isCorrect": boolean, "feedback": "Detailed explanation of why the answer is correct/incorrect", "score": number}. Ensure the JSON is well-formed and directly parsable.`;
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
    const prompt = `You are an AI interview assistant. Given the following interview context, generate qualitative feedback only (do NOT invent or recalculate any scores).\nRole: ${role}\nExperience Level: ${experienceLevel}\nScores: {overallScore: ${overallScore}, communicationSkills: ${communicationSkills}, technicalSkills: ${technicalSkills}, confidence: ${confidence}}\nResponses: ${JSON.stringify(uniqueBestResponses)}\nProvide:\n- Key strengths (array)\n- Areas for improvement (array)\n- Recommendations (array)\n- Detailed feedback summary (string).\nResponse format: {"strengths": ["...", "..."], "weaknesses": ["...", "..."], "recommendations": ["...", "..."], "detailedFeedback": "..."}. Ensure the JSON is well-formed and directly parsable.`;
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
- For code output questions: ALWAYS include the complete code snippet in the question field using proper markdown formatting

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
- Use proper markdown code blocks with triple backticks
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
- When including code: Use complete, executable code snippets in markdown format
- Minimum difficulty: LeetCode Easy-Medium level reasoning`;

    case 'mid level 3-5 years':
    case 'intermediate':
      return `INTERMEDIATE DIFFICULTY:
- Advanced algorithm design and optimization
- System design fundamentals and trade-offs
- Complex debugging scenarios with complete code examples
- Performance optimization questions
- Design pattern applications
- When including code: Use complete, executable code snippets in markdown format
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
- When including code: Use complete, executable code snippets in markdown format
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


/**
 * Generate a function signature placeholder for a coding problem in a given language using Gemini.
 * @param problemDescription The full problem description (including constraints, etc.)
 * @param language The programming language (e.g., 'python3', 'java', etc.)
 * @returns The function signature as a string (no comments, no solution)
 */
export async function generateFunctionSignature(problemDescription: string, language: string): Promise<string> {
  const prompt = `Given the following coding problem description, generate only the correct function signature (placeholder) for the selected programming language.\n\n- The signature must match the input/output types and structure described in the problem.\n- Follow standard conventions for the language:\n  * Java: Use 'public class Solution' with 'public static' method\n  * C++: Use 'class Solution' with 'public:' method (no static)\n  * Python: Use 'def' function\n  * C: Use regular function\n- The signature must be syntactically correct and ready to implement.\n- Do NOT include any comments, test cases, or solution code.\n- Only output the function signature, nothing else.\n\nProblem Description:\n${problemDescription}\n\nLanguage: ${language}`;
  return withKeyRotation(async () => {
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { responseMimeType: "text/plain" },
    });
    const response = await result.response;
    // Return the raw text, trimmed
    return response.text().trim();
  });
}

/**
 * Universal Judge0 Code Generator supporting all major programming languages
 * 
 * 🚨 CRITICAL: This function MUST NEVER modify the user's code.
 * It only creates wrapper/test harness code around the user's original function.
 */

interface TestCase {
  input: string;
  expectedOutput: string;
}

interface LanguageConfig {
  name: string;
  fileExtension: string;
  judge0Id: number;
  supportsClasses: boolean;
  commentStyle: 'line' | 'block';
}

const LANGUAGE_CONFIGS: Record<string, LanguageConfig> = {
  'c': { name: 'C', fileExtension: '.c', judge0Id: 50, supportsClasses: false, commentStyle: 'line' },
  'cpp': { name: 'C++', fileExtension: '.cpp', judge0Id: 54, supportsClasses: true, commentStyle: 'line' },
  'java': { name: 'Java', fileExtension: '.java', judge0Id: 62, supportsClasses: true, commentStyle: 'line' },
  'python': { name: 'Python', fileExtension: '.py', judge0Id: 71, supportsClasses: true, commentStyle: 'line' },
  'python3': { name: 'Python3', fileExtension: '.py', judge0Id: 71, supportsClasses: true, commentStyle: 'line' },
  'javascript': { name: 'JavaScript', fileExtension: '.js', judge0Id: 63, supportsClasses: true, commentStyle: 'line' },
  'typescript': { name: 'TypeScript', fileExtension: '.ts', judge0Id: 74, supportsClasses: true, commentStyle: 'line' },
  'php': { name: 'PHP', fileExtension: '.php', judge0Id: 68, supportsClasses: true, commentStyle: 'line' },
  'swift': { name: 'Swift', fileExtension: '.swift', judge0Id: 83, supportsClasses: true, commentStyle: 'line' },
  'kotlin': { name: 'Kotlin', fileExtension: '.kt', judge0Id: 78, supportsClasses: true, commentStyle: 'line' },
  'dart': { name: 'Dart', fileExtension: '.dart', judge0Id: 90, supportsClasses: true, commentStyle: 'line' },
  'go': { name: 'Go', fileExtension: '.go', judge0Id: 60, supportsClasses: false, commentStyle: 'line' },
  'ruby': { name: 'Ruby', fileExtension: '.rb', judge0Id: 72, supportsClasses: true, commentStyle: 'line' },
  'scala': { name: 'Scala', fileExtension: '.scala', judge0Id: 81, supportsClasses: true, commentStyle: 'line' },
  'rust': { name: 'Rust', fileExtension: '.rs', judge0Id: 73, supportsClasses: false, commentStyle: 'line' },
  'racket': { name: 'Racket', fileExtension: '.rkt', judge0Id: 84, supportsClasses: false, commentStyle: 'line' },
  'erlang': { name: 'Erlang', fileExtension: '.erl', judge0Id: 58, supportsClasses: false, commentStyle: 'block' },
  'elixir': { name: 'Elixir', fileExtension: '.ex', judge0Id: 57, supportsClasses: false, commentStyle: 'line' }
};

export async function generateJudge0ExecutableCode(
  userCode: string,
  language: string,
  testCases: TestCase[]
): Promise<string> {
  const langKey = language.toLowerCase();
  const config = LANGUAGE_CONFIGS[langKey];
  
  if (!config) {
    throw new Error(`Unsupported language: ${language}`);
  }

  const prompt = createPrompt(userCode, config, testCases);
  
  try {
    const model = getTextOnlyModel();
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      safetySettings,
      generationConfig: { 
        responseMimeType: "text/plain",
        temperature: 0.1
      },
    });
    
    const response = await result.response;
    let generatedCode = response.text().trim();
    
    // Clean and validate
    generatedCode = cleanGeneratedCode(generatedCode, langKey);
    generatedCode = removeDuplicateDefinitions(generatedCode, userCode, langKey);
    validateGeneratedCode(generatedCode, userCode, langKey, testCases);
    
    return generatedCode;
    
  } catch (error) {
    console.error(`Error generating ${config.name} code:`, error);
    return generateFallbackCode(userCode, langKey, testCases);
  }
}

function createPrompt(userCode: string, config: LanguageConfig, testCases: TestCase[]): string {
  const testCasesText = testCases.map((tc, i) => 
    `Test ${i + 1}:\nInput: ${tc.input}\nExpected Output: ${tc.expectedOutput}`
  ).join('\n\n');

  return `Generate COMPLETE, EXECUTABLE ${config.name} code for Judge0.

CRITICAL RULES:
1. NEVER modify the user's original code - preserve it EXACTLY
2. Only add necessary wrapper/boilerplate code  
3. Handle input parsing correctly based on the format
4. Output must match expected format EXACTLY
5. Generate a single, complete, compilable file

Language: ${config.name}

User Code (DO NOT MODIFY):
\`\`\`
${userCode}
\`\`\`

Test Cases:
${testCasesText}

${getLanguageSpecificInstructions(config.name.toLowerCase())}

CRITICAL OUTPUT FORMATTING:
- Match expected output format EXACTLY (spaces, newlines, no extra text)
- Don't add labels like "Output:" or "Result:"
- Handle arrays/lists by printing elements as specified in expected output
- Process ALL test cases in sequence
- Preserve exact spacing and line breaks from expected output

Return ONLY the complete executable code, no explanations or markdown.`;
}

function getLanguageSpecificInstructions(language: string): string {
  switch (language) {
    case 'c':
      return `C Requirements:
- Include necessary headers (#include <stdio.h>, <stdlib.h>, <string.h>)
- Preserve user's function exactly
- Create main() that processes ALL test cases
- Parse inputs and call user's function
- Use printf for output matching expected format`;

    case 'c++':
      return `C++ Requirements:
- Include #include <bits/stdc++.h>
- Add "using namespace std;"
- Preserve user's Solution class exactly
- Create main() that processes ALL test cases
- Parse inputs and call user's method
- Use cout for output matching expected format`;

    case 'java':
      return `Java Requirements:
- Add necessary imports (import java.util.*;)
- Preserve user's Solution class exactly
- Create public class Main with main method
- Process ALL test cases in sequence
- Parse inputs and instantiate Solution
- Use System.out.println for output`;

    case 'python':
    case 'python3':
      return `Python Requirements:
- Preserve user's code exactly at the top
- Add if __name__ == "__main__": block
- Process ALL test cases in sequence
- Parse inputs and call user's method/function
- Use print() for output matching expected format`;

    case 'javascript':
      return `JavaScript Requirements:
- Add "use strict" at top
- Preserve user's code exactly
- Create execution block for ALL test cases
- Parse inputs and call user's method
- Use console.log for output`;

    case 'typescript':
      return `TypeScript Requirements:
- Preserve user's code exactly
- Create execution block for ALL test cases
- Parse inputs with proper typing
- Call user's method with typed parameters
- Use console.log for output`;

    case 'php':
      return `PHP Requirements:
- Start with <?php
- Preserve user's code exactly
- Process ALL test cases
- Parse inputs and call user's method
- Use echo for output matching expected format`;

    case 'swift':
      return `Swift Requirements:
- Preserve user's code exactly
- Process ALL test cases in sequence
- Parse inputs and call user's method
- Use print() for output matching expected format`;

    case 'kotlin':
      return `Kotlin Requirements:
- Add fun main() function
- Preserve user's code exactly
- Process ALL test cases
- Parse inputs and call user's method
- Use println() for output`;

    case 'dart':
      return `Dart Requirements:
- Add main() function
- Preserve user's code exactly
- Process ALL test cases
- Parse inputs and call user's method
- Use print() for output`;

    case 'go':
      return `Go Requirements:
- Add package main and import "fmt"
- Preserve user's function exactly
- Create main() that processes ALL test cases
- Parse inputs and call user's function
- Use fmt.Println for output`;

    case 'ruby':
      return `Ruby Requirements:
- Preserve user's class/method exactly
- Process ALL test cases
- Parse inputs and call user's method
- Use puts for output matching expected format`;

    case 'scala':
      return `Scala Requirements:
- Create object Main with def main method
- Preserve user's code exactly
- Process ALL test cases
- Parse inputs and call user's method
- Use println for output`;

    case 'rust':
      return `Rust Requirements:
- Add fn main()
- Preserve user's function exactly
- Process ALL test cases
- Parse inputs and call user's function
- Use println! macro for output`;

    case 'racket':
      return `Racket Requirements:
- Add #lang racket
- Preserve user's function exactly
- Process ALL test cases
- Parse inputs and call user's function
- Use displayln for output`;

    case 'erlang':
      return `Erlang Requirements:
- Add -module(main)
- Add -export([main/0])
- Preserve user's function exactly
- Create main/0 that processes ALL test cases
- Use io:format for output`;

    case 'elixir':
      return `Elixir Requirements:
- Create defmodule Main
- Preserve user's function exactly
- Create main function that processes ALL test cases
- Use IO.puts for output`;

    default:
      return `Requirements:
- Preserve user's code exactly
- Process ALL test cases
- Parse inputs correctly
- Output in expected format`;
  }
}

function cleanGeneratedCode(code: string, language: string): string {
  // Remove markdown code blocks
  code = code.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '');
  
  // Remove language specification lines
  const langLine = new RegExp(`^${language}\\s*$`, 'gmi');
  code = code.replace(langLine, '');
  
  // Clean up extra whitespace
  code = code.replace(/\n{3,}/g, '\n\n').trim();
  
  return code;
}

function removeDuplicateDefinitions(generatedCode: string, userCode: string, language: string): string {
  switch (language) {
    case 'java':
      return cleanJavaDuplicates(generatedCode);
    case 'cpp':
    case 'c++':
      return cleanCppDuplicates(generatedCode);
    case 'python':
    case 'python3':
      return cleanPythonDuplicates(generatedCode, userCode);
    case 'javascript':
    case 'typescript':
      return cleanJavaScriptDuplicates(generatedCode, userCode);
    case 'scala':
      return cleanScalaDuplicates(generatedCode);
    case 'kotlin':
      return cleanKotlinDuplicates(generatedCode);
    default:
      return generatedCode;
  }
}

function cleanJavaDuplicates(code: string): string {
  // Remove duplicate Solution class definitions
  const solutionMatches = code.match(/(class\s+Solution\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})/g);
  if (solutionMatches && solutionMatches.length > 1) {
    let cleaned = code;
    for (let i = 1; i < solutionMatches.length; i++) {
      cleaned = cleaned.replace(solutionMatches[i], '');
    }
    code = cleaned;
  }
  
  // Remove duplicate imports
  const imports = code.match(/import\s+[^;]+;/g) || [];
  const uniqueImports = Array.from(new Set(imports));
  
  if (imports.length > uniqueImports.length) {
    let cleaned = code.replace(/import\s+[^;]+;\s*\n?/g, '');
    code = uniqueImports.join('\n') + '\n\n' + cleaned;
  }
  
  return code.trim();
}

function cleanCppDuplicates(code: string): string {
  const solutionRegex = /class\s+Solution\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const matches = code.match(solutionRegex);
  
  if (matches && matches.length > 1) {
    let cleaned = code;
    for (let i = 1; i < matches.length; i++) {
      cleaned = cleaned.replace(matches[i], '');
    }
    code = cleaned;
  }
  
  return code.trim();
}

function cleanPythonDuplicates(code: string, userCode: string): string {
  const classMatches = userCode.match(/class\s+(\w+)/g);
  
  if (classMatches) {
    classMatches.forEach(match => {
      const className = match.split(/\s+/)[1];
      const classRegex = new RegExp(`class\\s+${className}\\s*:[^\\n]*(?:\\n(?:\\s+[^\\n]*|\\n))*`, 'g');
      const occurrences = code.match(classRegex);
      if (occurrences && occurrences.length > 1) {
        for (let i = 1; i < occurrences.length; i++) {
          code = code.replace(occurrences[i], '');
        }
      }
    });
  }
  
  return code.trim();
}

function cleanJavaScriptDuplicates(code: string, userCode: string): string {
  const classMatches = userCode.match(/class\s+(\w+)/g);
  
  if (classMatches) {
    classMatches.forEach(match => {
      const className = match.split(/\s+/)[1];
      const classRegex = new RegExp(`class\\s+${className}\\s*\\{[^{}]*(?:\\{[^{}]*\\}[^{}]*)*\\}`, 'g');
      const occurrences = code.match(classRegex);
      if (occurrences && occurrences.length > 1) {
        for (let i = 1; i < occurrences.length; i++) {
          code = code.replace(occurrences[i], '');
        }
      }
    });
  }
  
  return code.trim();
}

function cleanScalaDuplicates(code: string): string {
  const objectRegex = /object\s+Solution\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const classRegex = /class\s+Solution\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  
  [objectRegex, classRegex].forEach(regex => {
    const matches = code.match(regex);
    if (matches && matches.length > 1) {
      for (let i = 1; i < matches.length; i++) {
        code = code.replace(matches[i], '');
      }
    }
  });
  
  return code.trim();
}

function cleanKotlinDuplicates(code: string): string {
  const classRegex = /class\s+Solution\s*\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g;
  const matches = code.match(classRegex);
  
  if (matches && matches.length > 1) {
    for (let i = 1; i < matches.length; i++) {
      code = code.replace(matches[i], '');
    }
  }
  
  return code.trim();
}

function validateGeneratedCode(
  code: string, 
  userCode: string, 
  language: string, 
  testCases: TestCase[]
): void {
  // Check if user code is preserved
  const normalizedUserCode = userCode.replace(/\s+/g, ' ').trim();
  const normalizedGenerated = code.replace(/\s+/g, ' ').trim();
  
  if (!normalizedGenerated.includes(normalizedUserCode)) {
    console.warn('Warning: User code may not be properly preserved in generated code');
  }
  
  // Language-specific validations
  switch (language) {
    case 'java':
      if (!code.includes('public class Main') && !code.includes('class Main')) {
        console.warn('Warning: Java code missing Main class');
      }
      break;
    case 'cpp':
    case 'c++':
      if (!code.includes('#include') && !code.includes('iostream')) {
        console.warn('Warning: C++ code missing necessary includes');
      }
      break;
    case 'python':
    case 'python3':
      if (!code.includes('if __name__')) {
        console.warn('Warning: Python code missing main execution block');
      }
      break;
    case 'go':
      if (!code.includes('package main')) {
        console.warn('Warning: Go code missing package main');
      }
      break;
  }
}

function generateFallbackCode(userCode: string, language: string, testCases: TestCase[]): string {
  const config = LANGUAGE_CONFIGS[language];
  const testCaseComments = testCases.map((tc, i) => 
    `Test case ${i + 1}: Input="${tc.input}" Expected="${tc.expectedOutput}"`
  ).join('\n');
  
  switch (language) {
    case 'c':
      return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

${userCode}

int main() {
    // ${testCaseComments}
    return 0;
}`;

    case 'cpp':
      return `#include <bits/stdc++.h>
using namespace std;

${userCode}

int main() {
    // ${testCaseComments}
    return 0;
}`;

    case 'java':
      return `import java.util.*;

${userCode}

public class Main {
    public static void main(String[] args) {
        // ${testCaseComments}
    }
}`;

    case 'python':
    case 'python3':
      return `${userCode}

if __name__ == "__main__":
    # ${testCaseComments.replace(/\/\//g, '#')}
    pass`;

    case 'javascript':
      return `"use strict";

${userCode}

(() => {
    // ${testCaseComments}
})();`;

    case 'typescript':
      return `${userCode}

(() => {
    // ${testCaseComments}
})();`;

    case 'php':
      return `<?php
${userCode}

// ${testCaseComments}
?>`;

    case 'swift':
      return `${userCode}

// ${testCaseComments}`;

    case 'kotlin':
      return `${userCode}

fun main() {
    // ${testCaseComments}
}`;

    case 'dart':
      return `${userCode}

void main() {
    // ${testCaseComments}
}`;

    case 'go':
      return `package main

import "fmt"

${userCode}

func main() {
    // ${testCaseComments}
}`;

    case 'ruby':
      return `${userCode}

# ${testCaseComments.replace(/\/\//g, '#')}`;

    case 'scala':
      return `${userCode}

object Main {
    def main(args: Array[String]): Unit = {
        // ${testCaseComments}
    }
}`;

    case 'rust':
      return `${userCode}

fn main() {
    // ${testCaseComments}
}`;

    case 'racket':
      return `#lang racket

${userCode}

; ${testCaseComments.replace(/\/\//g, ';')}`;

    case 'erlang':
      return `-module(main).
-export([main/0]).

${userCode}

main() ->
    % ${testCaseComments.replace(/\/\//g, '%')}.`;

    case 'elixir':
      return `defmodule Main do
  ${userCode}

  def main do
    # ${testCaseComments.replace(/\/\//g, '#')}
  end
end

Main.main()`;

    default:
      return `${userCode}

// ${testCaseComments}`;
  }
}

export async function generateFullCodeForTestCase(
  problemDescription: string,
  userCode: string,
  language: string,
  testCaseInput: string,
  expectedOutput: string
): Promise<string> {
  return generateJudge0ExecutableCode(userCode, language, [
    { input: testCaseInput, expectedOutput: expectedOutput }
  ]);
}

// Export language configurations for external use
export { LANGUAGE_CONFIGS };

// Helper functions for common use cases

/**
 * Get Judge0 language ID for a given language
 */
export function getJudge0LanguageId(language: string): number {
  const config = LANGUAGE_CONFIGS[language.toLowerCase()];
  return config ? config.judge0Id : -1;
}

/**
 * Get supported languages list
 */
export function getSupportedLanguages(): string[] {
  return Object.keys(LANGUAGE_CONFIGS);
}

/**
 * Validate if language is supported
 */
export function isLanguageSupported(language: string): boolean {
  return language.toLowerCase() in LANGUAGE_CONFIGS;
}

/**
 * Get file extension for a language
 */
export function getFileExtension(language: string): string {
  const config = LANGUAGE_CONFIGS[language.toLowerCase()];
  return config ? config.fileExtension : '.txt';
}

/**
 * Example usage function
 */
export async function exampleUsage() {
  const userCode = `class Solution {
    public int addTwoNumbers(int a, int b) {
        return a + b;
    }
}`;

  const testCases = [
    { input: "2 3", expectedOutput: "5" },
    { input: "10 15", expectedOutput: "25" },
    { input: "0 0", expectedOutput: "0" }
  ];

  try {
    const executableCode = await generateJudge0ExecutableCode(userCode, "java", testCases);
    console.log("Generated executable code:");
    console.log(executableCode);
    
    const judge0Id = getJudge0LanguageId("java");
    console.log(`Judge0 Language ID: ${judge0Id}`);
    
  } catch (error) {
    console.error("Error generating code:", error);
  }
}

/*
USAGE EXAMPLES FOR DIFFERENT LANGUAGES:

1. C++ Example:
```cpp
const cppCode = `class Solution {
public:
    int maxProfit(vector<int>& prices) {
        int maxProfit = 0;
        int minPrice = prices[0];
        for (int price : prices) {
            minPrice = min(minPrice, price);
            maxProfit = max(maxProfit, price - minPrice);
        }
        return maxProfit;
    }
};`;

const cppTests = [
    { input: "[7,1,5,3,6,4]", expectedOutput: "5" },
    { input: "[7,6,4,3,1]", expectedOutput: "0" }
];

generateJudge0ExecutableCode(cppCode, "cpp", cppTests);
```

2. Python Example:
```python
const pythonCode = `class Solution:
    def two_sum(self, nums, target):
        num_map = {}
        for i, num in enumerate(nums):
            complement = target - num
            if complement in num_map:
                return [num_map[complement], i]
            num_map[num] = i
        return []`;

const pythonTests = [
    { input: "[2,7,11,15] 9", expectedOutput: "[0, 1]" },
    { input: "[3,2,4] 6", expectedOutput: "[1, 2]" }
];

generateJudge0ExecutableCode(pythonCode, "python", pythonTests);
```

3. JavaScript Example:
```javascript
const jsCode = `class Solution {
    lengthOfLongestSubstring(s) {
        let maxLen = 0;
        let start = 0;
        let charMap = new Map();
        
        for (let end = 0; end < s.length; end++) {
            if (charMap.has(s[end])) {
                start = Math.max(charMap.get(s[end]) + 1, start);
            }
            charMap.set(s[end], end);
            maxLen = Math.max(maxLen, end - start + 1);
        }
        
        return maxLen;
    }
}`;

const jsTests = [
    { input: '"abcabcbb"', expectedOutput: "3" },
    { input: '"bbbbb"', expectedOutput: "1" },
    { input: '"pwwkew"', expectedOutput: "3" }
];

generateJudge0ExecutableCode(jsCode, "javascript", jsTests);
```

4. Go Example:
```go
const goCode = `func isPalindrome(x int) bool {
    if x < 0 {
        return false
    }
    
    original := x
    reversed := 0
    
    for x > 0 {
        reversed = reversed*10 + x%10
        x /= 10
    }
    
    return original == reversed
}`;

const goTests = [
    { input: "121", expectedOutput: "true" },
    { input: "-121", expectedOutput: "false" },
    { input: "10", expectedOutput: "false" }
];

generateJudge0ExecutableCode(goCode, "go", goTests);
```

5. Rust Example:
```rust
const rustCode = `fn fibonacci(n: i32) -> i32 {
    if n <= 1 {
        return n;
    }
    
    let mut a = 0;
    let mut b = 1;
    
    for _ in 2..=n {
        let temp = a + b;
        a = b;
        b = temp;
    }
    
    b
}`;

const rustTests = [
    { input: "10", expectedOutput: "55" },
    { input: "0", expectedOutput: "0" },
    { input: "1", expectedOutput: "1" }
];

generateJudge0ExecutableCode(rustCode, "rust", rustTests);
```
*/


/**
 * Call Gemini with a prompt and return the generated code as a string.
 */
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