import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ 
  apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY || "" 
});

export interface MCQQuestion {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
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
}

export interface InterviewFeedback {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  communicationSkills: number;
  technicalSkills: number;
  confidence: number;
  recommendations: string[];
  detailedFeedback: string;
}

export async function generateMCQQuestions(role: string, experienceLevel: string, count: number = 5): Promise<MCQQuestion[]> {
  try {
    const prompt = `Generate ${count} multiple choice questions for a ${experienceLevel} level ${role} interview. 
    Each question should be relevant to the role and experience level.
    
    Return the response as a JSON array with this structure:
    [
      {
        "question": "Question text",
        "options": ["Option A", "Option B", "Option C", "Option D"],
        "correctAnswer": "Option A",
        "explanation": "Why this is the correct answer"
      }
    ]`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "array",
          items: {
            type: "object",
            properties: {
              question: { type: "string" },
              options: { 
                type: "array",
                items: { type: "string" }
              },
              correctAnswer: { type: "string" },
              explanation: { type: "string" }
            },
            required: ["question", "options", "correctAnswer", "explanation"]
          }
        }
      },
      contents: prompt,
    });

    const jsonResponse = response.text;
    if (!jsonResponse) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Error generating MCQ questions:", error);
    
    // Return fallback questions when AI is unavailable
    const fallbackQuestions: MCQQuestion[] = [
      {
        question: "What is the primary purpose of version control systems like Git?",
        options: ["Code compilation", "Track changes and collaborate", "Database management", "User interface design"],
        correctAnswer: "Track changes and collaborate",
        explanation: "Version control systems help track changes in code and enable collaboration among developers."
      },
      {
        question: "Which HTTP method is typically used to retrieve data from a server?",
        options: ["POST", "GET", "PUT", "DELETE"],
        correctAnswer: "GET",
        explanation: "GET requests are used to retrieve data from a server without modifying it."
      },
      {
        question: "What does API stand for?",
        options: ["Application Programming Interface", "Advanced Programming Integration", "Automated Process Integration", "Application Process Interface"],
        correctAnswer: "Application Programming Interface",
        explanation: "API stands for Application Programming Interface, which defines how software components communicate."
      },
      {
        question: "In object-oriented programming, what is encapsulation?",
        options: ["Creating multiple instances", "Hiding internal details", "Inheritance of properties", "Method overloading"],
        correctAnswer: "Hiding internal details",
        explanation: "Encapsulation is the practice of hiding internal implementation details while exposing only necessary interfaces."
      },
      {
        question: "What is the time complexity of binary search?",
        options: ["O(n)", "O(log n)", "O(n²)", "O(1)"],
        correctAnswer: "O(log n)",
        explanation: "Binary search has logarithmic time complexity as it eliminates half the search space in each iteration."
      }
    ];
    
    return fallbackQuestions.slice(0, count);
  }
}

export async function generateCodingQuestion(role: string, experienceLevel: string): Promise<CodingQuestion> {
  try {
    const prompt = `Generate a coding problem suitable for a ${experienceLevel} level ${role} interview.
    The problem should be appropriate for the experience level and role.
    
    Return the response as JSON with this structure:
    {
      "title": "Problem title",
      "description": "Detailed problem description",
      "difficulty": "Easy/Medium/Hard",
      "constraints": ["Constraint 1", "Constraint 2"],
      "examples": [
        {
          "input": "Example input",
          "output": "Example output",
          "explanation": "Why this output"
        }
      ],
      "testCases": [
        {
          "input": "Test input",
          "expectedOutput": "Expected output"
        }
      ]
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            difficulty: { type: "string" },
            constraints: {
              type: "array",
              items: { type: "string" }
            },
            examples: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  output: { type: "string" },
                  explanation: { type: "string" }
                }
              }
            },
            testCases: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  input: { type: "string" },
                  expectedOutput: { type: "string" }
                }
              }
            }
          },
          required: ["title", "description", "difficulty", "constraints", "examples", "testCases"]
        }
      },
      contents: prompt,
    });

    const jsonResponse = response.text;
    if (!jsonResponse) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Error generating coding question:", error);
    
    // Return fallback coding question
    return {
      title: "Two Sum",
      description: "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
      difficulty: "Easy",
      constraints: [
        "2 <= nums.length <= 10^4",
        "-10^9 <= nums[i] <= 10^9",
        "-10^9 <= target <= 10^9",
        "Only one valid answer exists"
      ],
      examples: [
        {
          input: "nums = [2,7,11,15], target = 9",
          output: "[0,1]",
          explanation: "Because nums[0] + nums[1] == 9, we return [0, 1]."
        }
      ],
      testCases: [
        {
          input: "[2,7,11,15]\n9",
          expectedOutput: "[0,1]"
        },
        {
          input: "[3,2,4]\n6",
          expectedOutput: "[1,2]"
        }
      ]
    };
  }
}

export async function generateVoiceQuestion(role: string, experienceLevel: string, previousQuestions: string[] = []): Promise<string> {
  try {
    const previousQuestionsText = previousQuestions.length > 0 
      ? `\n\nAvoid asking about these topics that were already covered: ${previousQuestions.join(", ")}`
      : "";

    const prompt = `Generate a behavioral or situational interview question for a ${experienceLevel} level ${role} position.
    The question should be natural and conversational, as if asked by an HR interviewer.
    Focus on assessing soft skills, experience, problem-solving, and cultural fit.${previousQuestionsText}
    
    Return only the question text, nothing else.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
    });

    return response.text || "Tell me about yourself and why you're interested in this role.";
  } catch (error) {
    console.error("Error generating voice question:", error);
    return "Tell me about yourself and why you're interested in this role.";
  }
}

export async function evaluateMCQAnswer(question: string, selectedAnswer: string, correctAnswer: string): Promise<{ isCorrect: boolean; feedback: string; score: number }> {
  try {
    const prompt = `Evaluate this MCQ answer:
    Question: ${question}
    Selected Answer: ${selectedAnswer}
    Correct Answer: ${correctAnswer}
    
    Provide feedback and a score (0-100).
    
    Response format:
    {
      "isCorrect": boolean,
      "feedback": "Detailed explanation of why the answer is correct/incorrect",
      "score": number
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            isCorrect: { type: "boolean" },
            feedback: { type: "string" },
            score: { type: "number" }
          },
          required: ["isCorrect", "feedback", "score"]
        }
      },
      contents: prompt,
    });

    const jsonResponse = response.text;
    if (!jsonResponse) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Error evaluating MCQ answer:", error);
    const isCorrect = selectedAnswer === correctAnswer;
    return {
      isCorrect,
      feedback: isCorrect ? "Correct answer!" : "Incorrect answer. Please review the topic.",
      score: isCorrect ? 100 : 0
    };
  }
}

export async function evaluateVoiceResponse(question: string, response: string, role: string): Promise<{ score: number; feedback: string; suggestions: string[] }> {
  try {
    const prompt = `Evaluate this interview response:
    Question: ${question}
    Response: ${response}
    Role: ${role}
    
    Assess the response for:
    - Relevance to the question
    - Communication clarity
    - Professional tone
    - Content quality
    - Structure and organization
    
    Provide a score (0-100) and detailed feedback with specific suggestions for improvement.
    
    Response format:
    {
      "score": number,
      "feedback": "Detailed feedback on the response",
      "suggestions": ["Suggestion 1", "Suggestion 2", "Suggestion 3"]
    }`;

    const response_ai = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            score: { type: "number" },
            feedback: { type: "string" },
            suggestions: {
              type: "array",
              items: { type: "string" }
            }
          },
          required: ["score", "feedback", "suggestions"]
        }
      },
      contents: prompt,
    });

    const jsonResponse = response_ai.text;
    if (!jsonResponse) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Error evaluating voice response:", error);
    return {
      score: 70,
      feedback: "Unable to provide detailed feedback at this time. Please try again.",
      suggestions: ["Speak more clearly", "Provide more specific examples", "Structure your response better"]
    };
  }
}

export async function generateInterviewFeedback(responses: any[], role: string, experienceLevel: string): Promise<InterviewFeedback> {
  try {
    const prompt = `Generate comprehensive interview feedback based on these responses:
    Role: ${role}
    Experience Level: ${experienceLevel}
    Responses: ${JSON.stringify(responses)}
    
    Provide overall assessment including:
    - Overall score (0-100)
    - Key strengths
    - Areas for improvement
    - Communication skills rating (0-100)
    - Technical skills rating (0-100)
    - Confidence level rating (0-100)
    - Specific recommendations
    - Detailed feedback summary
    
    Response format:
    {
      "overallScore": number,
      "strengths": ["Strength 1", "Strength 2"],
      "weaknesses": ["Weakness 1", "Weakness 2"],
      "communicationSkills": number,
      "technicalSkills": number,
      "confidence": number,
      "recommendations": ["Recommendation 1", "Recommendation 2"],
      "detailedFeedback": "Comprehensive feedback summary"
    }`;

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            overallScore: { type: "number" },
            strengths: {
              type: "array",
              items: { type: "string" }
            },
            weaknesses: {
              type: "array",
              items: { type: "string" }
            },
            communicationSkills: { type: "number" },
            technicalSkills: { type: "number" },
            confidence: { type: "number" },
            recommendations: {
              type: "array",
              items: { type: "string" }
            },
            detailedFeedback: { type: "string" }
          },
          required: ["overallScore", "strengths", "weaknesses", "communicationSkills", "technicalSkills", "confidence", "recommendations", "detailedFeedback"]
        }
      },
      contents: prompt,
    });

    const jsonResponse = response.text;
    if (!jsonResponse) {
      throw new Error("Empty response from Gemini");
    }

    return JSON.parse(jsonResponse);
  } catch (error) {
    console.error("Error generating interview feedback:", error);
    return {
      overallScore: 75,
      strengths: ["Completed the interview", "Showed engagement"],
      weaknesses: ["Areas for improvement in responses"],
      communicationSkills: 75,
      technicalSkills: 75,
      confidence: 75,
      recommendations: ["Practice more interview questions", "Work on communication skills"],
      detailedFeedback: "Overall good performance with room for improvement."
    };
  }
}

export async function textToSpeech(text: string): Promise<string> {
  try {
    // For now, return the text as-is since Gemini TTS is not directly available
    // In a real implementation, you would integrate with Google Cloud Text-to-Speech
    return text;
  } catch (error) {
    console.error("Error in text-to-speech:", error);
    return text;
  }
}
