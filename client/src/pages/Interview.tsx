// Interview.tsx - Fixed voice interview logic

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import { RadioGroup, RadioGroupItem } from "../components/ui/radio-group";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import {
  Brain,
  Code,
  Mic,
  User,
  ArrowRight,
  Square,
  RefreshCw,
  Clock,
  AlertTriangle
} from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "../components/ui/avatar";
import { useInterviewQuery, useQuestionsQuery, useResponsesQuery } from "../hooks/useInterview";
import { useInterview } from "../hooks/useInterview";
import { useAuth } from "../hooks/useAuth";
import Header from "../components/Header";
import VoiceRecorder from "../components/VoiceRecorder";
import AIInterviewerAvatar from "../components/AIInterviewerAvatar";
import { useToast } from "../hooks/use-toast";
import { useTimer } from "../hooks/useTimer";
import type { Interview, Question, Response } from "../types/interview";

// Enhanced Question Renderer Component for MCQ formatting
interface QuestionRendererProps {
  question: string;
  onFixQuestion?: () => void;
}

const QuestionRenderer: React.FC<QuestionRendererProps> = ({ question, onFixQuestion }) => {
  // Enhanced detection for code snippets - more comprehensive patterns
  const hasCodeBlock = /```[\s\S]*?```|`[^`\n]+`|function\s+\w+\(|class\s+\w+|def\s+\w+\(|var\s+\w+|let\s+\w+|const\s+\w+|<[\w\s="'-]+>|console\.|print\(|System\.out|import\s+\w+|#include|public\s+class|private\s+\w+|for\s+\w+\s+in|if\s+\w+|while\s+\w+|return\s+|range\(/.test(question);
  
  // Check if question mentions code but doesn't show it properly
  const mentionsCode = /code snippet|following code|python code|javascript code|java code|c\+\+ code|consider.*code/i.test(question);
  const hasVisibleCode = /```|`\w+`|def |function |class |import |#include/.test(question);
  
  if (mentionsCode && !hasVisibleCode) {
    // Try to extract code from improperly formatted questions
    const codeExtractionPatterns = [
      // Try to find code after "code:" or similar
      /(?:code|snippet|following)\s*:?\s*([\s\S]*?)(?=\n\s*(?:What|Choose|Select|A\.|B\.|C\.|D\.|Options?|Answer)|$)/i,
      // Try to find indented code blocks
      /((?:^\s{2,}.*\n?)+)/gm,
      // Try to find code patterns without markers
      /((?:def\s+\w+|function\s+\w+|class\s+\w+|for\s+\w+|if\s+\w+|while\s+\w+)[\s\S]*?)(?=\n\s*(?:What|Choose|Select|A\.|B\.|C\.|D\.|Options?|Answer)|$)/i
    ];
    
    let extractedCode = null;
    for (const pattern of codeExtractionPatterns) {
      const match = question.match(pattern);
      if (match && match[1] && match[1].trim().length > 10) {
        extractedCode = match[1].trim();
        break;
      }
    }
    
    if (extractedCode) {
      // Found code! Display it properly
      const questionWithoutCode = question.replace(extractedCode, '').trim();
      return (
        <div className="space-y-4">
          <div className="text-gray-700 text-lg leading-relaxed space-y-2">
            {questionWithoutCode.split('\n').map((line, index) => (
              <div key={index} className={line.trim() ? '' : 'h-2'}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
          
          {/* Display the extracted code */}
          <div className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm my-4 border-l-4 border-green-500 shadow-lg">
            <div className="flex items-center mb-2 pb-2 border-b border-gray-700">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <span className="ml-4 text-gray-400 text-xs font-medium">EXTRACTED CODE</span>
            </div>
            <pre className="whitespace-pre-wrap overflow-auto">
              <code>{extractedCode}</code>
            </pre>
          </div>
          
          <div className="flex items-center text-sm text-blue-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
            <Code className="h-4 w-4 mr-2" />
            <span className="font-medium">Code extracted and formatted automatically - please verify it looks correct!</span>
          </div>
        </div>
      );
    }
    // Question mentions code but code is not visible - show warning
    return (
      <div className="space-y-4">
        <div className="text-gray-700 text-lg leading-relaxed space-y-2">
          {question.split('\n').map((line, index) => (
            <div key={index} className={line.trim() ? '' : 'h-2'}>
              {line || '\u00A0'}
            </div>
          ))}
        </div>
        <div className="flex items-center text-sm text-red-600 bg-red-50 px-4 py-3 rounded-lg border border-red-200">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <div className="flex-1">
            <span className="font-medium">Warning: This question references code that may not be displayed properly.</span>
            <p className="text-xs mt-1">The question mentions code but no code snippet is visible. This might be a formatting issue.</p>
          </div>
          {onFixQuestion && (
            <Button 
              onClick={onFixQuestion}
              variant="outline" 
              size="sm" 
              className="ml-2 text-red-600 border-red-300 hover:bg-red-100"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Fix Question
            </Button>
          )}
        </div>
      </div>
    );
  }
  
  if (!hasCodeBlock) {
    // Simple text question - display with better formatting
    return (
      <div className="text-gray-700 text-lg leading-relaxed space-y-2">
        {question.split('\n').map((line, index) => (
          <div key={index} className={line.trim() ? '' : 'h-2'}>
            {line || '\u00A0'}
          </div>
        ))}
      </div>
    );
  }

  // Process question with enhanced code formatting
  const processQuestionWithCode = (text: string): JSX.Element[] => {
    const elements: JSX.Element[] = [];
    let currentIndex = 0;
    let elementKey = 0;

    // Simplified regex for code detection
    const codeBlockRegex = /(```[\s\S]*?```|`[^`\n]+`)/g;
    let match: RegExpExecArray | null;
    
    while ((match = codeBlockRegex.exec(text)) !== null) {
      // Add text before code block
      if (match.index > currentIndex) {
        const beforeText = text.slice(currentIndex, match.index);
        if (beforeText.trim()) {
          elements.push(
            <div key={elementKey++} className="text-gray-700 mb-2">
              {beforeText.split('\n').map((line, idx) => (
                <div key={idx} className={line.trim() ? '' : 'h-2'}>
                  {line || '\u00A0'}
                </div>
              ))}
            </div>
          );
        }
      }
      
      // Add formatted code block
      const codeText = match[1];
      const isMultiLine = codeText.includes('\n') || codeText.startsWith('```');
      const cleanCode = codeText.replace(/```[\w]*\n?/g, '').replace(/\n```$/g, '').replace(/^`|`$/g, '').trim();
      
      if (isMultiLine) {
        // Multi-line code block
        elements.push(
          <div key={elementKey++} className="bg-gray-900 text-green-400 p-4 rounded-lg font-mono text-sm my-4 border-l-4 border-green-500 shadow-lg">
            <div className="flex items-center mb-2 pb-2 border-b border-gray-700">
              <div className="flex space-x-2">
                <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
              </div>
              <span className="ml-4 text-gray-400 text-xs font-medium">CODE BLOCK</span>
            </div>
            <pre className="whitespace-pre-wrap overflow-auto">
              <code>{cleanCode}</code>
            </pre>
          </div>
        );
      } else {
        // Inline code - styled differently
        elements.push(
          <span key={elementKey++} className="bg-gray-100 text-gray-800 px-3 py-1.5 rounded-md font-mono text-sm border border-gray-300 mx-1 inline-flex items-center">
            <Code className="w-3 h-3 mr-1 text-blue-600" />
            {cleanCode}
          </span>
        );
      }
      
      currentIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (currentIndex < text.length) {
      const remainingText = text.slice(currentIndex);
      if (remainingText.trim()) {
        elements.push(
          <div key={elementKey++} className="text-gray-700">
            {remainingText.split('\n').map((line, idx) => (
              <div key={idx} className={line.trim() ? '' : 'h-2'}>
                {line || '\u00A0'}
              </div>
            ))}
          </div>
        );
      }
    }
    
    return elements;
  };

  return (
    <div className="space-y-4">
      <div className="text-lg leading-relaxed">
        {processQuestionWithCode(question)}
      </div>
      <div className="flex items-center text-sm text-blue-600 bg-blue-50 px-4 py-3 rounded-lg border border-blue-200">
        <Code className="h-4 w-4 mr-2" />
        <span className="font-medium">This question contains code - take your time to read it carefully!</span>
      </div>
      {/* Debug info for development - remove in production */}
      {process.env.NODE_ENV === 'development' && (
        <details className="text-xs text-gray-500 border border-gray-200 rounded p-2">
          <summary className="cursor-pointer">Debug: Raw Question Data</summary>
          <pre className="mt-2 whitespace-pre-wrap">{JSON.stringify(question, null, 2)}</pre>
        </details>
      )}
    </div>
  );
};

// Type guard for Interview
function isInterview(obj: any): obj is Interview {
  return obj && typeof obj === 'object' && typeof obj.id === 'number' && typeof obj.role === 'string';
}

// Add a normalization function for role matching
function normalizeRole(role: string) {
  return role.toLowerCase().replace(/[^a-z]/g, ' ');
}

const technicalRoles = [
  'software engineer',
  'backend engineer',
  'backend developer',
  'frontend engineer',
  'frontend developer',
  'full stack engineer',
  'full stack developer',
  'machine learning engineer',
  'ai engineer',
  'data scientist',
  'devops engineer',
  'site reliability engineer',
  'qa engineer',
  'test engineer',
  'systems engineer',
  'embedded engineer',
  'cloud engineer',
  'platform engineer',
  'web developer',
  'mobile developer',
];

export default function Interview() {
  // All hooks and derived variables at the top
  const { id } = useParams();
  const { dbUser, loading, getToken } = useAuth();
  const { toast } = useToast();
  const interviewId = id ? parseInt(id) : null;
  const {
    updateInterviewMutation,
    submitResponseMutation,
    generateVoiceQuestionMutation,
    completeInterviewMutation,
    regenerateQuestionsMutation
  } = useInterview();
  const { data: interview, isLoading: interviewLoading, refetch } = useInterviewQuery(interviewId);
  const { data: questions = [], isLoading: questionsLoading, refetch: refetchQuestions } = useQuestionsQuery(interviewId);
  const { data: responses = [] } = useResponsesQuery(interviewId);
  
  // SIMPLIFIED VOICE INTERVIEW STATE - Single source of truth
  const [voiceInterview, setVoiceInterview] = useState({
    currentQuestionNumber: 1,
    qaHistory: [] as Array<{question: string, answer: string}>,
    hasWelcomeQuestion: false,
    isGenerating: false
  });
  
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mcqStatusById, setMcqStatusById] = useState<Record<number, 'answered' | 'skipped'>>({});

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showRefreshButton, setShowRefreshButton] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);

  // Camera state for voice stage
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [isRecordingWithCamera, setIsRecordingWithCamera] = useState(false);
  const [cameraAnalysisResults, setCameraAnalysisResults] = useState<any>(null);
  const [showCameraResults, setShowCameraResults] = useState(false);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);

  const maxVoiceQuestions = 5; // Total voice questions including welcome

  // Calculate current voice question number (1-based for user display)
  const currentVoiceQuestionNumber = voiceInterview.currentQuestionNumber;

  // Validate that we have real questions from the backend
  const hasRealQuestions = questions && Array.isArray(questions) && questions.length > 0;

  const navigate = useNavigate();
  const [interviewCompleted, setInterviewCompleted] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [regenError, setRegenError] = useState("");
  const [startTime, setStartTime] = useState<number | null>(null);
  const [, setForceUpdate] = useState({});
  const transitioningRef = useRef(false);

  // onExpire indirection to avoid "used before declaration" and stale closures
  const mcqOnExpireRef = useRef<() => void>(() => {});

  // Function to force component re-render
  const forceUpdate = useCallback(() => setForceUpdate({}), []);

  // Refs to prevent duplicate generations
  const isGeneratingRef = useRef(false);
  const voiceInterviewInitializationRef = useRef(false);
  const hasSpokenCurrentQuestionRef = useRef(false);
  // Add refs to prevent race conditions
  const isStartingRecordingRef = useRef(false);
  const isStoppingRecordingRef = useRef(false);
  const isSubmittingVoiceRef = useRef(false);
  // Add ref to track if we've attempted to generate the first voice question
  const hasAttemptedFirstQuestionGeneration = useRef(false);

  // Derived variables
  const safeQuestions = (Array.isArray(questions) ? questions : []).map((q: any) => ({
    id: typeof q.id === 'number' ? q.id : 0,
    interviewId: typeof q.interviewId === 'number' ? q.interviewId : 0,
    stage: typeof q.stage === 'number' ? q.stage : 1,
    type: typeof q.type === 'string' ? q.type : 'mcq',
    question: typeof q.question === 'string' ? q.question : '',
    options: Array.isArray(q.options) ? q.options.filter((opt: any) => typeof opt === 'string') : [],
    correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : '',
    testCases: Array.isArray(q.testCases) ? q.testCases : [],
    aiGenerated: typeof q.aiGenerated === 'boolean' ? q.aiGenerated : true,
    createdAt: q.createdAt ? new Date(q.createdAt) : new Date(),
  }));
  const typedInterview = isInterview(interview) ? interview : null;
  const typedResponses = responses as Response[];

  // Now, after all data is loaded, derive these
  const currentStage = typedInterview?.currentStage || 1;
  const currentStageQuestions = Array.isArray(allQuestions)
    ? allQuestions.filter((q) => Number(q.stage) === Number(currentStage))
    : [];
  
  // For voice interviews, use a simple approach - get the current question by number
  const currentQuestion = useMemo(() => {
    if (currentStage === 3) {
      // For voice stage, we need to handle the case where we're waiting for the next question to be generated
      // First, get all voice questions and sort them by creation time
      const voiceQuestions = [...currentStageQuestions].sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // If we have enough questions for the current question number, return it
      const questionIndex = voiceInterview.currentQuestionNumber - 1;
      if (questionIndex < voiceQuestions.length) {
        return voiceQuestions[questionIndex];
      }
      
      // If we don't have enough questions, return null (we're waiting for generation)
      return null;
    } else {
      return currentStageQuestions[currentQuestionIndex] || null;
    }
  }, [currentStage, currentStageQuestions, currentQuestionIndex, voiceInterview.currentQuestionNumber]);

  // Helper function to reset voice interview state
  const resetVoiceInterviewState = useCallback(() => {
    setVoiceInterview({
      currentQuestionNumber: 1,
      qaHistory: [],
      hasWelcomeQuestion: false,
      isGenerating: false
    });
    setTextAnswer("");
    setAudioBlob(null);
    isGeneratingRef.current = false;
    hasAttemptedFirstQuestionGeneration.current = false; // Reset this flag too
    
    if (typedInterview?.id) {
      localStorage.removeItem(`voice-interview-${typedInterview.id}`);
    }
  }, [typedInterview?.id]);

  // Handle transitions between voice questions
  useEffect(() => {
    // When moving to a new voice question (not the first one), we might need to generate it
    if (currentStage === 3 && voiceInterview.currentQuestionNumber > 1 && !currentQuestion && !isGeneratingRef.current) {
      // Check if we have the question in our local state
      const questionIndex = voiceInterview.currentQuestionNumber - 1;
      const voiceQuestions = Array.isArray(allQuestions) 
        ? allQuestions.filter((q) => Number(q.stage) === 3)
        : [];
      
      // Sort by creation time to ensure proper order
      const sortedQuestions = voiceQuestions.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      
      // If we don't have this question yet, we might need to generate it
      if (questionIndex >= sortedQuestions.length) {
        console.log('🎤 Need to generate next voice question:', voiceInterview.currentQuestionNumber);
        // The question should have been generated by handleVoiceSubmit, but if not, we can try to regenerate
        // This is a fallback mechanism - in normal flow, questions are generated in handleVoiceSubmit
        
        // Generate the next question
        isGeneratingRef.current = true;
        setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
        
        // Get the QA history for context
        const qaHistory = voiceInterview.qaHistory;
        
        // We can't call generateVoiceQuestion directly here due to hook dependencies
        // Instead, we'll trigger the generation through a different mechanism
        console.log('🎤 Fallback generation needed for question:', voiceInterview.currentQuestionNumber);
      }
    }
  }, [currentStage, voiceInterview.currentQuestionNumber, currentQuestion, allQuestions, voiceInterview.qaHistory]);

  // MAIN VOICE INTERVIEW LOGIC - Generate first question when entering stage 3
  useEffect(() => {
    if (currentStage === 3 && !voiceInterview.hasWelcomeQuestion && !isGeneratingRef.current) {
      console.log('🎤 Generating first voice question');
      // Call the function that generates the first question
      setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
      isGeneratingRef.current = true;
      generateVoiceQuestion(1, []);
    }
  }, [currentStage, voiceInterview.hasWelcomeQuestion]);

  // Memoize completeInterview to avoid dependency issues
  const completeInterview = useCallback(async () => {
    if (!typedInterview) return;
    const endTime = Date.now();
    const durationMinutes = startTime ? Math.round((endTime - startTime) / 60000) : 0;
    await updateInterviewMutation.mutateAsync({
      id: typedInterview.id,
      data: { durationMinutes },
    });
    try {
      await completeInterviewMutation.mutateAsync(typedInterview.id);
      toast({
        title: "Interview Complete!",
        description: "Generating your results...",
      });
      navigate(`/results/${typedInterview.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete interview.",
        variant: "destructive",
      });
    }
  }, [typedInterview, startTime, updateInterviewMutation, completeInterviewMutation, toast, navigate]);

  const handleRegenerateQuestions = async () => {
    if (!interviewId) return;

    setRegenerating(true);
    setRegenError("");

    try {
      await regenerateQuestionsMutation.mutateAsync(interviewId);

      // Force refetch to ensure UI updates immediately
      if (typeof refetchQuestions === 'function') {
        await refetchQuestions();
      }

      toast({
        title: "Questions Regenerated!",
        description: "New questions have been generated for your interview.",
      });
      
      // Reset all interview state
      setCurrentQuestionIndex(0);
      setSelectedAnswer("");
      setTextAnswer("");
      setAudioBlob(null);
      setInterviewCompleted(false);
      
      // Use the helper function to reset voice state
      resetVoiceInterviewState();
      
    } catch (error) {
      console.error('Error regenerating questions:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to regenerate questions. Please try again.';
      setRegenError(errorMessage);
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setRegenerating(false);
    }
  };

  // Function to fix broken MCQ questions
  const handleFixQuestion = async () => {
    if (!currentQuestion || currentQuestion.type !== 'mcq') {
      toast({
        title: "Error",
        description: "No MCQ question found to fix.",
        variant: "destructive",
      });
      return;
    }

    try {
      const token = await getToken();
      const response = await fetch(`/api/questions/${currentQuestion.id}/fix`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fix question');
      }

      const result = await response.json();

      if (result.wasFixed) {
        toast({
          title: "Question Fixed!",
          description: "A new question has been generated to replace the broken one.",
        });
        
        // Force refetch questions to get the updated question
        if (typeof refetchQuestions === 'function') {
          await refetchQuestions();
        }
      } else {
        toast({
          title: "No Fix Needed",
          description: "The question appears to be formatted correctly.",
        });
      }
    } catch (error) {
      console.error('Error fixing question:', error);
      toast({
        title: "Error",
        description: "Failed to fix the question. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Function to generate voice question
  const generateVoiceQuestion = useCallback(async (questionNumber: number, qaHistory: Array<{question: string, answer: string}>) => {
    if (!typedInterview?.id) {
      console.log('⚠️ Skipping question generation - no interview');
      return null;
    }

    // Prevent duplicate generation with a simpler approach
    if (isGeneratingRef.current) {
      console.log('⚠️ Skipping question generation - already in progress');
      return null;
    }

    console.log('🎤 Generating voice question:', { questionNumber, qaHistory: qaHistory.length });
    
    // Set flags immediately
    isGeneratingRef.current = true;
    setVoiceInterview(prev => ({ ...prev, isGenerating: true }));

    try {
      const token = await getToken();
      
      // Determine question type based on number
      const isWelcomeQuestion = questionNumber === 1;
      
      const requestBody = {
        previousQA: qaHistory,
        questionNumber: questionNumber,
        isWelcomeQuestion: isWelcomeQuestion
      };

      console.log('📤 Sending request:', requestBody);

      const res = await fetch(`/api/interviews/${typedInterview.id}/voice-question`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody)
      });

      if (!res.ok) {
        // Handle specific case where welcome question might already exist
        if (questionNumber === 1 && res.status === 409) {
          console.log('⚠️ Welcome question already exists on server, fetching existing questions');
          // Refresh our local question list
          if (typeof refetchQuestions === 'function') {
            await refetchQuestions();
          }
          // Set to show first question
          setVoiceInterview(prev => ({
            ...prev,
            currentQuestionNumber: 1
          }));
          return null;
        }
        throw new Error(`Failed to generate voice question: ${res.status}`);
      }

      const newQuestion = await res.json();
      console.log('✅ Generated voice question:', { 
        id: newQuestion.id, 
        question: newQuestion.question.substring(0, 100) + '...' 
      });

      // Add the new question to allQuestions
      const formattedQuestion = {
        ...newQuestion,
        stage: 3,
        type: 'voice',
        interviewId: typedInterview.id,
        createdAt: new Date()
      };

      setAllQuestions(prev => {
        // Remove any existing question with the same ID to prevent duplicates
        const filtered = prev.filter(q => q.id !== formattedQuestion.id);
        return [...filtered, formattedQuestion];
      });

      return formattedQuestion;

    } catch (error) {
      console.error('❌ Failed to generate voice question:', error);
      toast({
        title: "Error",
        description: "Failed to generate voice question. Please try again.",
        variant: "destructive",
      });
      return null;
    } finally {
      // Always reset flags
      isGeneratingRef.current = false;
      setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
    }
  }, [typedInterview?.id, getToken, toast, refetchQuestions]);

  // Camera functions for voice stage
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      setCameraStream(stream);
      setCameraActive(true);
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Camera Error",
        description: "Could not access your camera. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopCamera = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const startRecordingWithCamera = async () => {
    // Prevent multiple simultaneous calls
    if (isStartingRecordingRef.current) {
      console.log('⚠️ Start recording already in progress');
      return;
    }
    
    if (!typedInterview?.id) return;
    
    try {
      isStartingRecordingRef.current = true;
      
      // Start camera if not already active
      if (!cameraActive) {
        await startCamera();
      }
      
      // Set recording start time
      setRecordingStartTime(Date.now());
      
      // Start recording with camera
      const token = await getToken();
      const response = await fetch(`/api/interviews/${typedInterview.id}/voice/start`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || `Failed to start recording: ${response.status}`);
      }
      
      setIsRecordingWithCamera(true);
      toast({
        title: "Recording Started",
        description: "Camera and microphone recording activated. Please speak for at least 10 seconds for accurate analysis.",
      });
    } catch (error: any) {
      console.error('Error starting camera recording:', error);
      toast({
        title: "Recording Error",
        description: `Failed to start camera recording: ${error.message || error.toString() || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      isStartingRecordingRef.current = false;
    }
  };

  const stopRecordingWithCamera = async () => {
    // Prevent multiple simultaneous calls
    if (isStoppingRecordingRef.current) {
      console.log('⚠️ Stop recording already in progress');
      return;
    }
    
    if (!typedInterview?.id) return;
    
    // Check if minimum recording time has passed (increased to 10 seconds for better analysis)
    if (recordingStartTime) {
      const recordingDuration = Date.now() - recordingStartTime;
      const minRecordingTime = 10000; // Increased to 10 seconds for reliable analysis
      
      if (recordingDuration < minRecordingTime) {
        const remainingTime = Math.ceil((minRecordingTime - recordingDuration) / 1000);
        toast({
          title: "Recording Too Short",
          description: `Please continue recording for at least ${remainingTime} more seconds for accurate analysis. Recommended: 15+ seconds.`,
          variant: "destructive",
        });
        return;
      }
    }
    
    try {
      isStoppingRecordingRef.current = true;
      
      // Show loading state
      setIsSubmitting(true);
      
      // Stop recording with camera
      const token = await getToken();
      const response = await fetch(`/api/interviews/${typedInterview.id}/voice/stop`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to stop recording');
      }
      
      setCameraAnalysisResults(data);
      setShowCameraResults(true);
      setIsRecordingWithCamera(false);
      setRecordingStartTime(null); // Reset recording start time
      
      // Stop camera stream
      stopCamera();
      
      toast({
        title: "Recording Stopped",
        description: "Analysis complete. Results available.",
      });
    } catch (error: any) {
      console.error('Error stopping camera recording:', error);
      toast({
        title: "Recording Error",
        description: `Failed to stop camera recording: ${error.message || 'Unknown error'}`,
        variant: "destructive",
      });
    } finally {
      isStoppingRecordingRef.current = false;
      setIsSubmitting(false);
    }
  };

  // All useEffects at the top
  useEffect(() => {
    if (typedInterview?.status === 'in_progress' && !startTime) {
      // Initialize start time when interview becomes in progress
      setStartTime(Date.now());
      console.log('Interview started, tracking duration');
    }
    // eslint-disable-next-line
  }, [typedInterview?.status, startTime]);

  // Function to move to the next stage
  const moveToNextStage = async () => {
    if (transitioningRef.current) {
      console.log('🚫 Already transitioning, skipping duplicate call');
      return;
    }

    transitioningRef.current = true;
    console.log('🚀 MOVE TO NEXT STAGE called');
    const nextStage = typedInterview?.currentStage ? typedInterview.currentStage + 1 : 1;
    console.log('📊 Stage progression:', {
      currentStage: typedInterview?.currentStage,
      nextStage: nextStage,
      shouldComplete: nextStage > 3
    });

    try {
      // Include coding stage for all roles
      if (nextStage === 2) {
        // Reset question index immediately to prevent UI flicker
        setCurrentQuestionIndex(-1); // Set to -1 to indicate transition state
        // Wait for the interview to be updated before navigating
        const updatedInterview = await updateInterviewMutation.mutateAsync({
          id: typedInterview?.id ?? 0,
          data: { currentStage: nextStage }
        });
        // Force refetch to ensure we have the latest data
        if (typeof refetch === 'function') {
          await refetch();
        }
        // Navigate to coding stage
        navigate(`/interview/${typedInterview?.id}/coding`);
        transitioningRef.current = false;
      } else if (nextStage === 3) {
        // Reset question index immediately to prevent UI flicker
        setCurrentQuestionIndex(-1); // Set to -1 to indicate transition state
        // Wait for the interview to be updated before navigating
        const updatedInterview = await updateInterviewMutation.mutateAsync({
          id: typedInterview?.id ?? 0,
          data: { currentStage: nextStage }
        });
        resetVoiceInterviewState();
        // Force refetch to ensure we have the latest data
        if (typeof refetch === 'function') {
          await refetch();
        }
        // Navigate to voice interview stage
        navigate(`/interview/${typedInterview?.id}`);
        transitioningRef.current = false;
      } else {
        console.log('🏁 COMPLETING INTERVIEW - nextStage > 3 or already at final stage');
        await completeInterview();
        transitioningRef.current = false;
      }
    } catch (error) {
      console.error('Error in moveToNextStage:', error);
      transitioningRef.current = false;
    }
  };

  // Create timer BEFORE handler; wire onExpire through the ref
  const mcqTimer = useTimer({
    initialTime: 60, // 1 minute
    onExpire: () => mcqOnExpireRef.current(),
    autoStart: false, // Will be started when question changes
    pauseOnBlur: true
  });

  // MCQ Timer - 1 minute per question (expiry handler)
  const handleMCQTimerExpire = useCallback(() => {
    // Timer lifecycle: reset at the very top to prevent ghost expiries
    mcqTimer.reset();

    // Use current values from state at the time of expiry
    const stage = typedInterview?.currentStage || 1;
    const questionsInStage = allQuestions.filter(q => q.stage === stage);
    const currentQ = questionsInStage[currentQuestionIndex];
    const currentAnswer = selectedAnswer;

    if (stage !== 1 || !currentQ) return;

    // Snapshot qid
    const qid = currentQ.id;

    // CASE A: User selected an option before expiry (auto-submit chosen option)
    if (currentAnswer) {
      // Mark question as answered
      setMcqStatusById(prev => ({ ...prev, [qid]: 'answered' }));

      // Snapshot ans (the selected answer)
      const ans = currentAnswer;
      setSelectedAnswer("");

      // Advance immediately (next question or stage)
      if (currentQuestionIndex < questionsInStage.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // For the last question, navigate immediately to prevent UI flicker
        void moveToNextStage();
      }

      // Fire submitResponseMutation.mutate with onError
      submitResponseMutation.mutate(
        { questionId: qid, answer: ans },
        {
          onError: (error: any) => {
            console.error('Background auto-submit failed:', error);
            toast({
              title: "Warning",
              description: "Answer auto-submitted but may not have been saved.",
              variant: "destructive",
            });
          }
        }
      );
    }
    // CASE B: No option selected at expiry
    else {
      // Mark question as skipped
      setMcqStatusById(prev => ({ ...prev, [qid]: 'skipped' }));

      // Show "Time's up! Question skipped..." toast
      toast({
        title: "Time's up!",
        description: "Question skipped due to time limit. Moving to next question...",
        variant: "destructive",
      });

      // Advance immediately
      if (currentQuestionIndex < questionsInStage.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        // For the last question, navigate immediately to prevent UI flicker
        void moveToNextStage();
      }

      // Fire submitResponseMutation.mutate with onError
      submitResponseMutation.mutate(
        { questionId: qid, answer: "Question skipped due to time limit" },
        {
          onError: (error: any) => {
            console.error('Background skip submission failed:', error);
            toast({
              title: "Warning",
              description: "Skip recorded but may not have been saved.",
              variant: "destructive",
            });
          }
        }
      );
    }

    // Extra safeguard
    mcqTimer.reset();
  }, [typedInterview?.currentStage, allQuestions, currentQuestionIndex, submitResponseMutation, moveToNextStage, toast, selectedAnswer]);

  // Point the ref to the latest handler
  useEffect(() => {
    mcqOnExpireRef.current = handleMCQTimerExpire;
  }, [handleMCQTimerExpire]);

  // Sync allQuestions with TanStack Query data
  useEffect(() => {
    if (questions && Array.isArray(questions)) {
      setAllQuestions(questions);
      // Only reset question index if questions changed significantly and we're not in transition
      if (questions.length > 0 && currentStage !== 3 && currentQuestionIndex !== -1) {
        setCurrentQuestionIndex(0);
      }
    } else {
      // Clear stale data if no questions exist
      setAllQuestions([]);
      if (currentStage !== 3 && currentQuestionIndex !== -1) {
        setCurrentQuestionIndex(0);
      }
    }
  }, [questions, currentStage]);

  useEffect(() => {
    // Check if we're coming from coding stage to prevent redirect loop
    const urlParams = new URLSearchParams(window.location.search);
    const fromCoding = urlParams.get('from') === 'coding';
    
    console.log('🔍 Stage redirect check:', {
      typedInterview: typedInterview,
      currentStage: typedInterview?.currentStage,
      fromCoding: fromCoding,
      transitioningRef: transitioningRef.current
    });
    
    // Only redirect if we're not in a transition state
    if (typedInterview && typedInterview.currentStage === 2 && !transitioningRef.current && !fromCoding && currentQuestionIndex !== -1) {
      const currentPath = window.location.pathname;
      const isOnCodingPage = currentPath.includes('/coding');
      
      console.log('🔄 Redirecting to coding stage:', {
        currentPath: currentPath,
        isOnCodingPage: isOnCodingPage
      });

      // Only redirect if we're NOT already on the coding page and NOT coming from coding
      if (!isOnCodingPage) {
        // Navigate immediately to coding stage
        navigate(`/interview/${typedInterview.id}/coding`);
      }
    }
  }, [typedInterview, navigate, currentQuestionIndex]);

  useEffect(() => {
    if (typedInterview?.status === 'completed') {
      navigate(`/results/${typedInterview.id}`);
    }
  }, [typedInterview, navigate]);

  useEffect(() => {
    return () => {
      if (typedInterview?.id) {
        localStorage.removeItem(`voice-interview-${typedInterview.id}`);
      }
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      // Reset all refs when component unmounts
      isGeneratingRef.current = false;
      voiceInterviewInitializationRef.current = false;
      hasSpokenCurrentQuestionRef.current = false;
      isStartingRecordingRef.current = false;
      isStoppingRecordingRef.current = false;
      isSubmittingVoiceRef.current = false;
    };
  }, [typedInterview?.id]);

  useEffect(() => {
    if (typedInterview?.status === 'in_progress') {
      if (typeof refetchQuestions === 'function') refetchQuestions();
      if (typeof refetch === 'function') refetch();
    }
    const handleFocus = () => {
      if (typedInterview?.status === 'in_progress') {
        // Only refetch if not in voice stage to avoid disrupting the flow
        if (typedInterview.currentStage !== 3) {
          if (typeof refetchQuestions === 'function') refetchQuestions();
          if (typeof refetch === 'function') refetch();
        }
      }
    };

    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [typedInterview?.status, refetchQuestions, refetch, typedInterview?.currentStage]);

  // Force data refresh when navigating from coding stage
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const fromCoding = urlParams.get('from') === 'coding';

    if (fromCoding && typedInterview) {
      console.log('🔄 Detected navigation from coding stage - forcing data refresh');
      
      // Clear the URL parameter immediately
      window.history.replaceState({}, '', window.location.pathname);

      // Force comprehensive refresh of interview and questions data with longer delay
      const refreshData = async () => {
        try {
          console.log('📊 Refreshing interview data after coding submission');
          
          // Use Promise.all to refresh both queries simultaneously
          await Promise.all([
            typeof refetch === 'function' ? refetch() : Promise.resolve(),
            typeof refetchQuestions === 'function' ? refetchQuestions() : Promise.resolve()
          ]);
          
          // Additional delay to ensure all data is properly synced
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          console.log('✅ Data refresh completed');
        } catch (error) {
          console.error('❌ Error refreshing data:', error);
        }
      };
      
      // Add a longer delay to ensure backend processing is fully complete
      setTimeout(refreshData, 1000);
    }
  }, [typedInterview, refetch, refetchQuestions]);

  // MCQ Timer management - start timer for each new question
  useEffect(() => {
    if (currentStage === 1 && currentQuestion) {
      console.log('🕐 Starting MCQ timer for question:', currentQuestion.id);
      mcqTimer.reset();
      mcqTimer.start();
    } else {
      mcqTimer.reset();
    }
  }, [currentStage, currentQuestion?.id]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      mcqTimer.reset();
    };
  }, []);

  // Reset voice interview state when not in stage 3
  useEffect(() => {
    if (currentStage !== 3) {
      resetVoiceInterviewState();
      // Reset the flag when leaving voice stage
      hasAttemptedFirstQuestionGeneration.current = false;
    }
  }, [currentStage, resetVoiceInterviewState]);

  // MAIN VOICE INTERVIEW LOGIC - Generate first question when entering stage 3
  useEffect(() => {
    // Only run if we're in stage 3 and haven't already attempted to generate the first question
    if (currentStage !== 3) {
      return;
    }
    
    // Check if we need to generate the first question
    const shouldGenerateFirstQuestion = 
      voiceInterview.currentQuestionNumber === 1 && 
      !voiceInterview.isGenerating && 
      !isGeneratingRef.current &&
      !hasAttemptedFirstQuestionGeneration.current;
    
    if (shouldGenerateFirstQuestion) {
      hasAttemptedFirstQuestionGeneration.current = true;
      
      const generateFirstQuestion = async () => {
        // Set generating flags immediately
        isGeneratingRef.current = true;
        setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
        
        try {
          // Small delay to ensure backend operations complete
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Force refresh questions from server to ensure we have the latest data
          if (typeof refetchQuestions === 'function') {
            await refetchQuestions();
          }
          
          // Wait a bit more for state to update
          await new Promise(resolve => setTimeout(resolve, 300));
          
          // Check for existing voice questions after refresh
          const currentQuestions = Array.isArray(allQuestions) 
            ? allQuestions.filter((q) => Number(q.stage) === 3)
            : [];
          
          // Check if welcome question already exists
          const welcomeExists = currentQuestions.some(q => 
            q.question.toLowerCase().includes('welcome') && 
            q.question.toLowerCase().includes('introduce yourself')
          );
          
          if (!welcomeExists) {
            await generateVoiceQuestion(1, []);
          } else {
            // Ensure our local state reflects the existing welcome question
            setVoiceInterview(prev => ({
              ...prev,
              currentQuestionNumber: 1
            }));
          }
        } catch (error) {
          console.error('Error during voice interview initialization:', error);
          // Even if refresh fails, try to generate the question
          await generateVoiceQuestion(1, []);
        } finally {
          // Always reset generating flags
          isGeneratingRef.current = false;
          setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
        }
      };

      generateFirstQuestion();
    }
  }, [currentStage, voiceInterview.currentQuestionNumber, voiceInterview.isGenerating, generateVoiceQuestion, allQuestions, refetchQuestions, typedInterview?.id]);

  // Speak current question when it changes (voice stage only)
  useEffect(() => {
    // Reset the ref when question changes
    hasSpokenCurrentQuestionRef.current = false;
    
    // Only speak if we're in voice stage, have a question, and haven't spoken this question yet
    if (currentStage === 3 && currentQuestion && currentQuestion.question && !hasSpokenCurrentQuestionRef.current) {
      // Mark that we've spoken this question
      hasSpokenCurrentQuestionRef.current = true;
      
      // Add a small delay to ensure state is fully updated
      const timer = setTimeout(() => {
        speakText(currentQuestion.question);
      }, 300);
      
      return () => clearTimeout(timer);
    }
    
    // Cleanup function to cancel speech when component unmounts or question changes
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [currentStage, currentQuestion?.id, currentQuestion?.question]); // Include question text in dependencies

  if (loading || interviewLoading || questionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex flex-col items-center justify-center min-h-screen px-2 sm:px-6 lg:px-8">
          <div className="text-center w-full max-w-md sm:max-w-lg md:max-w-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600 text-base sm:text-lg">
              {interviewLoading && !typedInterview ? 'Setting up your interview...' : 'Loading interview...'}
            </p>
            {interviewLoading && !typedInterview && (
              <p className="text-sm text-gray-500 mt-2">
                This may take a few moments while we generate your questions.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Critical check: If no interview data exists, redirect to dashboard
  if (!interviewId || !typedInterview || !dbUser) {
    // Debug logging
    console.log('🔍 Interview page debug:', {
      interviewId,
      hasTypedInterview: !!typedInterview,
      hasDbUser: !!dbUser,
      interviewLoading,
      questionsLoading,
      loading
    });
    
    // Clear any stale data
    if (typeof window !== 'undefined') {
      localStorage.removeItem(`voice-interview-${interviewId}`);
      // Clear all voice interview related data
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('voice-interview-')) {
          localStorage.removeItem(key);
        }
      });
    }
    
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <p className="text-gray-600 mb-4">Interview not found or you are not logged in.</p>
            <p className="text-sm text-gray-500 mb-4">
              {!dbUser ? 'Please log in to access your interviews.' : 
               !typedInterview ? 'The interview might still be processing. Please wait a moment and try again.' : 
               'This might be due to stale data or the interview was deleted.'}
            </p>
            <div className="space-y-2">
              <Button 
                onClick={() => navigate('/dashboard')}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
              >
                Go to Dashboard
              </Button>
              <br />
              <Button 
                onClick={() => window.location.reload()}
                variant="outline"
                className="px-4 py-2 rounded"
              >
                Refresh Page
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- If there are no questions and we're not in voice stage, show regenerate UI ---
  if (Array.isArray(allQuestions) && allQuestions.length === 0 && currentStage !== 3) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex flex-col items-center justify-center min-h-screen px-2 sm:px-6 lg:px-8">
          <div className="text-center w-full max-w-md sm:max-w-lg md:max-w-2xl">
            <h2 className="text-xl font-bold mb-4 text-red-600">No questions found for this interview.</h2>
            <p className="mb-4 text-gray-700">This can happen if there was a problem generating questions or if the interview data is stale.</p>
            {regenError && <div className="mb-2 text-red-500">{regenError}</div>}
            <div className="space-y-3">
              <Button
                onClick={handleRegenerateQuestions}
                disabled={regenerating}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${regenerating ? 'animate-spin' : ''}`} />
                {regenerating ? 'Regenerating...' : 'Regenerate Questions'}
              </Button>
              <br />
              <Button
                onClick={() => window.location.href = '/dashboard'}
                variant="outline"
                className="px-4 py-2 rounded"
              >
                Back to Dashboard
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const stageInfo = {
    1: { title: "Multiple Choice Questions", icon: Brain, color: "text-blue-600" },
    2: { title: "Coding Challenge", icon: Code, color: "text-green-600" },
    3: { title: "Voice Interview", icon: Mic, color: "text-purple-600" }
  };

  const currentStageInfo = stageInfo[currentStage as keyof typeof stageInfo] || stageInfo[1];
  const StageIcon = currentStageInfo.icon;

  // Compute progress safely with clamping
  const stageBase = (Math.min(currentStage, 3) - 1) / 3;
  const inStage = currentStageQuestions.length > 0 ? 
    (currentStage === 3 ? (voiceInterview.currentQuestionNumber - 1) / maxVoiceQuestions : currentQuestionIndex / currentStageQuestions.length) : 0;
  const progress = Math.round((stageBase + inStage / 3) * 100);

  const speakText = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      // Add a small delay to ensure cancellation is complete
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.onstart = () => setIsSpeaking(true);
        utterance.onend = () => setIsSpeaking(false);
        utterance.onerror = () => setIsSpeaking(false);
        window.speechSynthesis.speak(utterance);
      }, 100);
    }
  };

  // Function to handle MCQ submission asynchronously
  const handleMCQSubmit = async () => {
    // Timer lifecycle: reset at the very top to prevent ghost expiries
    mcqTimer.reset();
    
    if (!selectedAnswer) {
      toast({
        title: "Please select an answer",
        description: "Choose one of the options before continuing.",
        variant: "destructive",
      });
      return;
    }
    
    // Check if currentQuestion exists
    if (!currentQuestion) {
      toast({
        title: "Error",
        description: "No question found. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }
    
    // Mark question as answered
    setMcqStatusById(prev => ({ ...prev, [currentQuestion.id]: 'answered' }));
    
    // Snapshot qid and ans
    const qid = currentQuestion.id;
    const ans = selectedAnswer;
    
    // If this is the last question, navigate immediately to prevent UI flicker
    if (currentQuestionIndex >= currentStageQuestions.length - 1) {
      console.log('🏁 All MCQ questions completed, moving to next stage');
      // Clear selected answer immediately to prevent UI issues
      setSelectedAnswer("");
      // Navigate to next stage immediately
      moveToNextStage();
    } else {
      // Advance to next question
      console.log('➡️ Moving to next MCQ question');
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer("");
    }
    
    // Fire-and-forget submission in background
    submitResponseMutation.mutate(
      { questionId: qid, answer: ans },
      { 
        onError: (error: any) => {
          console.error('Background MCQ submission failed:', error);
          toast({
            title: "Warning",
            description: "Answer submitted but may not have been saved. Please check your connection.",
            variant: "destructive",
          });
        }
      }
    );
  };

  const handleCodingSubmit = async (code: string, result: any) => {
    // Check if currentQuestion exists
    if (!currentQuestion) {
      toast({
        title: "Error",
        description: "No question found. Please refresh the page.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    try {
      await submitResponseMutation.mutateAsync({
        questionId: currentQuestion.id,
        answer: code,
      });
      await moveToNextStage();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit code. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // FIXED handleVoiceSubmit function
  const handleVoiceSubmit = async (blob?: Blob) => {
    // Prevent multiple simultaneous calls
    if (isSubmittingVoiceRef.current) {
      console.log('⚠️ Voice submit already in progress');
      return;
    }
    
    // Prevent duplicate generation with a simpler approach
    if (isGeneratingRef.current) {
      console.log('⚠️ Skipping question generation - already in progress');
      return;
    }
    
    if (!typedInterview) {
      toast({
        title: "No interview found",
        description: "Please refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      isSubmittingVoiceRef.current = true;
      setIsSubmitting(true);
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
      
      // Special handling for the welcome question
      if (voiceInterview.currentQuestionNumber === 1 && !voiceInterview.hasWelcomeQuestion) {
        console.log('🎤 Generating and submitting welcome question');
        
        // First generate the welcome question
        isGeneratingRef.current = true;
        setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
        
        try {
          await generateVoiceQuestion(1, []);
        } finally {
          isGeneratingRef.current = false;
          setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
        }
        
        // Update state to indicate we have the welcome question
        setVoiceInterview(prev => ({
          ...prev,
          hasWelcomeQuestion: true
        }));
        
        // Now get the welcome question from allQuestions
        const welcomeQuestion = allQuestions.find(q => 
          q.stage === 3 && 
          q.question.toLowerCase().includes('welcome') && 
          q.question.toLowerCase().includes('introduce yourself')
        ) || allQuestions.find(q => q.stage === 3);
        
        if (!welcomeQuestion) {
          toast({
            title: "No welcome question found",
            description: "Please refresh the page and try again.",
            variant: "destructive",
          });
          return;
        }
        
        // Submit the response for the welcome question
        let audioBase64;
        const finalBlob = blob || audioBlob;
        if (finalBlob) {
          audioBase64 = await blobToBase64(finalBlob);
        }
        
        console.log('🎤 Submitting welcome question response:', {
          questionId: welcomeQuestion.id,
          answerLength: textAnswer.length,
          hasAudio: !!audioBase64,
          hasCameraResults: !!cameraAnalysisResults
        });
        
        // Submit the response - prioritize camera results, then text answer, then audio
        const answerText = cameraAnalysisResults?.transcript || textAnswer || '';
        
        // Include camera analysis data in the response if available
        let codingEvaluation: any = {};
        if (cameraAnalysisResults) {
          codingEvaluation = {
            cameraAnalysis: {
              transcript: cameraAnalysisResults.transcript,
              geminiScore: cameraAnalysisResults.geminiScore,
              geminiFeedback: cameraAnalysisResults.geminiFeedback,
              dominantEmotion: cameraAnalysisResults.dominantEmotion,
              eyeContactPct: cameraAnalysisResults.eyeContactPct,
              headMovementStd: cameraAnalysisResults.headMovementStd,
              postureScore: cameraAnalysisResults.postureScore,
              visualScore: cameraAnalysisResults.visualScore,
              finalScore: cameraAnalysisResults.finalScore,
              emotionLog: cameraAnalysisResults.emotionLog
            }
          };
        }
        
        // Submit the response
        await submitResponseMutation.mutateAsync({
          questionId: welcomeQuestion.id,
          answer: answerText,
          audioBlob: audioBase64,
          codingEvaluation: codingEvaluation
        });
        
        // Generate the second question
        isGeneratingRef.current = true;
        setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
        
        try {
          await generateVoiceQuestion(2, [{ question: welcomeQuestion.question, answer: answerText }]);
        } finally {
          isGeneratingRef.current = false;
          setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
        }
        
        // Update voice interview state
        setVoiceInterview(prev => ({
          ...prev,
          currentQuestionNumber: 2,
          qaHistory: [...prev.qaHistory, { question: welcomeQuestion.question, answer: answerText }]
        }));
        
        // Clear form and results
        setTextAnswer("");
        setAudioBlob(null);
        setCameraAnalysisResults(null);
        setShowCameraResults(false);
        setShowRefreshButton(true);
        
        return;
      }
      
      // For subsequent questions, we need to have a current question
      if (!currentQuestion) {
        toast({
          title: "No question found",
          description: "Please refresh the page and try again.",
          variant: "destructive",
        });
        return;
      }
      
      let audioBase64;
      const finalBlob = blob || audioBlob;
      if (finalBlob) {
        audioBase64 = await blobToBase64(finalBlob);
      }
      
      console.log('🎤 Submitting voice response:', {
        questionId: currentQuestion.id,
        currentQuestionNumber: voiceInterview.currentQuestionNumber,
        answerLength: textAnswer.length,
        hasAudio: !!audioBase64,
        hasCameraResults: !!cameraAnalysisResults
      });
      
      // Submit the response - prioritize camera results, then text answer, then audio
      const answerText = cameraAnalysisResults?.transcript || textAnswer || '';
      
      // Include camera analysis data in the response if available
      let codingEvaluation: any = {};
      if (cameraAnalysisResults) {
        codingEvaluation = {
          cameraAnalysis: {
            transcript: cameraAnalysisResults.transcript,
            geminiScore: cameraAnalysisResults.geminiScore,
            geminiFeedback: cameraAnalysisResults.geminiFeedback,
            dominantEmotion: cameraAnalysisResults.dominantEmotion,
            eyeContactPct: cameraAnalysisResults.eyeContactPct,
            headMovementStd: cameraAnalysisResults.headMovementStd,
            postureScore: cameraAnalysisResults.postureScore,
            visualScore: cameraAnalysisResults.visualScore,
            finalScore: cameraAnalysisResults.finalScore,
            emotionLog: cameraAnalysisResults.emotionLog
          }
        };
      }
      
      // Submit the response
      await submitResponseMutation.mutateAsync({
        questionId: currentQuestion.id,
        answer: answerText,
        audioBlob: audioBase64,
        codingEvaluation: codingEvaluation
      });
      
      // For questions after the first one, we need to generate the next question before updating state
      const isLastQuestion = voiceInterview.currentQuestionNumber >= maxVoiceQuestions;
      
      if (!isLastQuestion) {
        // Generate the next question before updating state
        isGeneratingRef.current = true;
        setVoiceInterview(prev => ({ ...prev, isGenerating: true }));
        
        try {
          await generateVoiceQuestion(
            voiceInterview.currentQuestionNumber + 1,
            [...voiceInterview.qaHistory, { question: currentQuestion.question, answer: answerText }]
          );
        } finally {
          isGeneratingRef.current = false;
          setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
        }
      }
      
      // Update voice interview state
      setVoiceInterview(prev => ({
        ...prev,
        currentQuestionNumber: prev.currentQuestionNumber + 1,
        qaHistory: [...prev.qaHistory, { question: currentQuestion.question, answer: answerText }]
      }));
      
      // Clear form and results
      setTextAnswer("");
      setAudioBlob(null);
      setCameraAnalysisResults(null);
      setShowCameraResults(false);
      setShowRefreshButton(true);
      
      // If this was the last question, complete the interview
      if (isLastQuestion) {
        await completeInterview();
      }
    } catch (error) {
      console.error('Error submitting voice response:', error);
      toast({
        title: "Error",
        description: "Failed to submit your response. Please try again.",
        variant: "destructive",
      });
    } finally {
      isSubmittingVoiceRef.current = false;
      setIsSubmitting(false);
    }
  };

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  function renderCurrentQuestion() {
  // Add a speaking animation when the AI is speaking
  const speakingAnimation = isSpeaking ? "animate-pulse" : "";

  // Avatar component for AI interviewer
  const InterviewerAvatar = () => (
    <AIInterviewerAvatar isSpeaking={isSpeaking} size="md" className="mr-4" />
  );
  
  // Handle transition state
  if (currentQuestionIndex === -1) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
        <p className="text-gray-600">Moving to next stage...</p>
      </div>
    );
  }
  
    if (!currentStageQuestions || currentStageQuestions.length === 0) {
    // Add avatar to voice interview loading state
    if (currentStage === 3 && voiceInterview.isGenerating) {
      return (
        <div className="text-center py-8">
          <div className="flex items-center justify-center mb-4">
            <InterviewerAvatar />
          </div>
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">
            {voiceInterview.currentQuestionNumber === 1 
              ? "Generating welcome question..." 
              : `Generating question ${voiceInterview.currentQuestionNumber}...`}
          </p>
        </div>
      );
    }
      if (currentStage === 3 && voiceInterview.isGenerating) {
        return (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">
              {voiceInterview.currentQuestionNumber === 1 
                ? "Generating welcome question..." 
                : `Generating question ${voiceInterview.currentQuestionNumber}...`}
            </p>
          </div>
        );
      }
      // Show loading state for voice interview when no questions exist yet
      if (currentStage === 3) {
        return (
          <div className="text-center py-8">
            <div className="flex items-center justify-center mb-4">
              <InterviewerAvatar />
            </div>
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Preparing your voice interview...</p>
          </div>
        );
      }
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Generating questions...</p>
          {showRefreshButton && (
            <div className="mt-4">
              <Button onClick={() => window.location.reload()} variant="outline" size="sm">
                Refresh Page
              </Button>
            </div>
          )}
        </div>
      );
    }
    
    if (!currentQuestion) {
      if (currentStage === 3) {
        return (
          <div className="text-center py-8">
            <div className="flex items-center justify-center mb-4">
              <AIInterviewerAvatar isSpeaking={false} size="lg" />
            </div>
            <p className="text-gray-600 mb-4">
              {voiceInterview.isGenerating 
                ? "Generating voice question..." 
                : "No question found for this stage."}
            </p>
            {!voiceInterview.isGenerating && (
              <Button onClick={completeInterview} className="mt-4">
                Finish Interview & View Results
              </Button>
            )}
          </div>
        );
      }
      return <div className="text-center py-8 text-gray-600">No question found for this stage.</div>;
    }
    
    if (currentStage === 1) {
      return (
        <div className="space-y-6 animate-in slide-in-from-right duration-300">
          {/* Enhanced Header Section */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="bg-blue-500 text-white p-3 rounded-full">
                  <Brain className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gray-900">Multiple Choice Question</h3>
                  <div className="flex items-center space-x-4 mt-1">
                    <span className="text-sm text-gray-600">
                      Question {currentQuestionIndex + 1} of {currentStageQuestions.length}
                    </span>
                    {/* Show indicator if previous question was skipped */}
                    {currentQuestionIndex > 0 && currentStageQuestions[currentQuestionIndex - 1] && 
                     mcqStatusById[currentStageQuestions[currentQuestionIndex - 1].id] === 'skipped' && (
                      <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">
                        Previous: Skipped
                      </Badge>
                    )}
                    <div className="flex items-center space-x-2">
                      <Progress value={(currentQuestionIndex / currentStageQuestions.length) * 100} className="w-20 h-1.5" />
                      <span className="text-xs text-gray-500">{Math.round((currentQuestionIndex / currentStageQuestions.length) * 100)}%</span>
                    </div>
                  </div>
                </div>
              </div>
              
              {/* Enhanced Timer Section */}
              <div className="text-right">
                <div className="flex items-center space-x-3 mb-2">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-500 uppercase tracking-wide">Time Remaining</span>
                </div>
                <div className="flex items-center justify-end space-x-3">
                  <div className="relative">
                    <svg className="w-6 h-6 transform -rotate-90" viewBox="0 0 24 24">
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                        className="text-gray-200"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="2"
                        fill="none"
                        strokeDasharray={`${(mcqTimer.timeRemaining / 60) * 62.83} 62.83`}
                        className={`transition-all duration-1000 ${mcqTimer.isWarning ? 'text-red-500' : 'text-blue-500'}`}
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <span className={`font-mono text-2xl font-bold transition-all duration-300 ${mcqTimer.isWarning ? 'text-red-600 animate-pulse' : 'text-gray-700'}`}>
                      {mcqTimer.formatTime()}
                    </span>
                    {mcqTimer.isWarning && (
                      <div className="flex items-center justify-center space-x-1 mt-1">
                        <AlertTriangle className="h-4 w-4 text-red-500 animate-bounce" />
                        <span className="text-xs text-red-600 font-medium animate-pulse">Hurry up!</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            
            {/* Enhanced Timer progress bar */}
            <div className="w-full mt-4">
              <Progress 
                value={((60 - mcqTimer.timeRemaining) / 60) * 100} 
                className="h-2 rounded-full" 
                style={{
                  '--progress-color': mcqTimer.isWarning ? '#dc2626' : '#3b82f6'
                } as React.CSSProperties}
              />
            </div>
          </div>

          {/* Enhanced Question Card */}
          <div className="bg-white border-2 border-gray-200 rounded-xl p-8 shadow-sm">
            {/* Question Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-yellow-100 text-yellow-800 px-4 py-2 rounded-full text-sm font-semibold">
                📝 Question
              </div>
              <div className="text-sm text-gray-500">
                Read carefully - {mcqTimer.formatTime()} remaining
              </div>
            </div>
            
            {/* Enhanced Question Display */}
            <div className="mb-8">
              <QuestionRenderer 
                question={currentQuestion.question} 
                onFixQuestion={handleFixQuestion}
              />
            </div>
            {/* Answer Options Header */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="bg-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-semibold">
                💯 Choose Your Answer
              </div>
              <div className="text-sm text-gray-500">
                Click on an option to select it
              </div>
            </div>
            
            {/* Enhanced Options Display */}
            <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
              <div className="space-y-4">
                {Array.isArray(currentQuestion.options) && currentQuestion.options.map(function(option: string, index: number) {
                  const optionLetter = String.fromCharCode(65 + index); // A, B, C, D
                  const hasCode = /```|`[^`]+`|function\s|class\s|def\s|var\s|let\s|const\s|<\w+|\{[^}]*\}|\([^)]*\)|;$|import\s/.test(option);
                  const isSelected = selectedAnswer === option;
                  
                  return (
                    <div key={index} className="relative">
                      <div className={`flex items-start space-x-4 p-5 rounded-xl border-2 transition-all duration-200 cursor-pointer hover:shadow-md ${
                        isSelected 
                          ? 'border-blue-400 bg-blue-50 shadow-md' 
                          : 'border-gray-200 bg-white hover:border-gray-300'
                      }`} 
                           onClick={() => setSelectedAnswer(option)}>
                        <RadioGroupItem value={option} id={`option-${index}`} className="mt-1.5" />
                        <div className="flex-1">
                          <div className="flex items-center space-x-3 mb-3">
                            <div className={`font-bold text-base px-3 py-1.5 rounded-full min-w-[36px] text-center transition-colors ${
                              isSelected 
                                ? 'bg-blue-500 text-white' 
                                : 'bg-gray-100 text-gray-700'
                            }`}>
                              {optionLetter}
                            </div>
                            {hasCode && (
                              <div className="flex items-center space-x-1">
                                <Code className="h-4 w-4 text-blue-600" />
                                <span className="text-xs text-blue-600 font-medium">Contains Code</span>
                              </div>
                            )}
                          </div>
                          <Label htmlFor={`option-${index}`} className="cursor-pointer text-base leading-relaxed">
                            {hasCode ? (
                              <div className="space-y-3">
                                <QuestionRenderer 
                                  question={option} 
                                  onFixQuestion={handleFixQuestion}
                                />
                              </div>
                            ) : (
                              <div className="text-gray-700 text-base leading-relaxed">{option}</div>
                            )}
                          </Label>
                        </div>
                      </div>
                      {isSelected && (
                        <div className="absolute -right-3 -top-3 bg-blue-500 text-white rounded-full p-2 shadow-lg">
                          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </RadioGroup>
          </div>
          
          {/* Enhanced Submit Section */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex justify-between items-center">
              {selectedAnswer ? (
                <div className="flex items-center space-x-2 text-green-600">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span className="font-medium">Answer selected</span>
                </div>
              ) : (
                <div className="text-gray-500 text-sm">
                  Please select an answer to continue
                </div>
              )}
              
              <Button
                onClick={handleMCQSubmit}
                disabled={!selectedAnswer}
                size="lg"
                className={`px-8 py-3 text-base font-semibold transition-all duration-200 ${
                  selectedAnswer 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg hover:shadow-xl' 
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                Submit Answer
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </div>
      );
    }
    
    if (currentStage === 2 && currentQuestion) {
      let codingDesc = '';
      try {
        if (typeof currentQuestion.question === 'string') {
          const parsed = JSON.parse(currentQuestion.question);
          codingDesc = parsed.description || '';
        }
      } catch {
        codingDesc = '';
      }
      return (
        <div>
          <h2 className="text-xl font-bold mb-4">Coding Challenge</h2>
          <p className="mb-4 whitespace-pre-wrap">{codingDesc || "No description"}</p>
          {/* TODO: Add your code editor and submit button here */}
        </div>
      );
    }
    
    if (currentStage === 3 && currentQuestion) {
      return (
        <div className="space-y-6 animate-in slide-in-from-left duration-300">
          {/* Camera Preview and Controls */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="font-semibold text-gray-900 mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <InterviewerAvatar />
                <span>
                  {voiceInterview.currentQuestionNumber === 1 
                    ? "Welcome Question" 
                    : `Question ${voiceInterview.currentQuestionNumber} of ${maxVoiceQuestions}`}
                </span>
                <div className="flex items-center space-x-2">
                  <Progress value={(voiceInterview.currentQuestionNumber / maxVoiceQuestions) * 100} className="w-24 h-2" />
                  <span className="text-sm text-gray-500">{Math.round((voiceInterview.currentQuestionNumber / maxVoiceQuestions) * 100)}%</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => speakText(currentQuestion.question)}
                  disabled={isSpeaking}
                  className="flex items-center space-x-1"
                >
                  {isSpeaking ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary"></div>
                      <span>Speaking...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="h-3 w-3" />
                      <span>Listen</span>
                    </>
                  )}
                </Button>
                {isSpeaking && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if ('speechSynthesis' in window) {
                        window.speechSynthesis.cancel();
                        setIsSpeaking(false);
                      }
                    }}
                    className="flex items-center space-x-1"
                  >
                    <Square className="h-3 w-3" />
                    <span>Stop</span>
                  </Button>
                )}
              </div>
            </div>
            
            <div className="bg-white rounded-lg p-4 mb-4">
              <p className="text-gray-700">{currentQuestion.question}</p>
            </div>
            
            {/* Camera Preview */}
            <div className="mb-4">
              <div className="flex flex-col md:flex-row gap-4">
                {/* Camera Preview */}
                <div className="flex-1">
                  <h3 className="text-lg font-medium mb-2">Camera Preview</h3>
                  <div className="relative bg-gray-200 rounded-lg overflow-hidden" style={{ height: '200px' }}>
                    {cameraActive && cameraStream ? (
                      <video 
                        autoPlay 
                        playsInline 
                        muted 
                        ref={(video) => {
                          if (video && cameraStream) {
                            video.srcObject = cameraStream;
                          }
                        }}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex items-center justify-center h-full text-gray-500">
                        Camera off
                      </div>
                    )}
                    
                    {/* Recording indicator */}
                    {isRecordingWithCamera && (
                      <div className="absolute top-2 right-2 flex items-center">
                        <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse mr-2"></div>
                        <span className="text-red-500 font-medium text-sm">REC</span>
                      </div>
                    )}
                  </div>
                </div>
                
                {/* Camera Controls */}
                <div className="flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-medium mb-2">Recording Controls</h3>
                    <p className="text-sm text-gray-600 mb-3">Enable camera to analyze your body language and eye contact during the interview.</p>
                  </div>
                  
                  <div className="flex flex-col space-y-2">
                    {!cameraActive ? (
                      <Button 
                        onClick={startCamera}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        Enable Camera
                      </Button>
                    ) : (
                      <Button 
                        onClick={stopCamera}
                        variant="outline"
                      >
                        Disable Camera
                      </Button>
                    )}
                    
                    {cameraActive && !isRecordingWithCamera ? (
                      <Button 
                        onClick={startRecordingWithCamera}
                        className="bg-red-600 hover:bg-red-700"
                      >
                        Start Answer
                      </Button>
                    ) : cameraActive && isRecordingWithCamera ? (
                      <Button 
                        onClick={stopRecordingWithCamera}
                        className="bg-gray-600 hover:bg-gray-700"
                      >
                        Stop Answer
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Camera Analysis Results */}
          {showCameraResults && cameraAnalysisResults && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Interview Analysis Results</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium mb-2">Transcript</h4>
                    <div className="bg-gray-100 p-3 rounded text-sm">
                      {cameraAnalysisResults.transcript || "No transcript available"}
                    </div>
                    {/* Add warning for short analysis time */}
                    {cameraAnalysisResults.dataQuality === 'very_low' && (
                      <div className="mt-2 p-2 bg-yellow-100 border border-yellow-300 rounded text-yellow-800 text-sm">
                        <p className="font-medium">⚠️ Short Recording Warning</p>
                        <p>Analysis time was too short for reliable results. Please record for at least 10 seconds for accurate analysis.</p>
                      </div>
                    )}
                    {cameraAnalysisResults.dataQuality === 'low' && cameraAnalysisResults.analysisNote?.includes('short') && (
                      <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
                        <p className="font-medium">ℹ️ Short Recording Note</p>
                        <p>Analysis time was brief - results may have limited accuracy.</p>
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <h4 className="font-medium mb-2">AI Evaluation</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Relevance Score:</span>
                        <span className="font-medium">{cameraAnalysisResults.geminiScore || 0}/100</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Eye Contact:</span>
                        <span className="font-medium">{Math.round((cameraAnalysisResults.eyeContactPct || 0) * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Posture:</span>
                        <span className="font-medium">{Math.round((cameraAnalysisResults.postureScore || 0) * 100)}%</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Final Combined Score:</span>
                        <span className="font-bold text-lg">{cameraAnalysisResults.finalScore || 0}/100</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                {(cameraAnalysisResults.geminiFeedback || cameraAnalysisResults.dominantEmotion) && (
                  <div className="mt-4 pt-4 border-t">
                    <h4 className="font-medium mb-2">Feedback</h4>
                    <div className="bg-blue-50 p-3 rounded text-sm">
                      {cameraAnalysisResults.geminiFeedback && (
                        <p className="mb-2">{cameraAnalysisResults.geminiFeedback}</p>
                      )}
                      {cameraAnalysisResults.dominantEmotion && (
                        <p>Detected Emotion: <span className="font-medium">{cameraAnalysisResults.dominantEmotion}</span></p>
                      )}
                      {/* Add data quality indicator with more detailed warnings */}
                      {cameraAnalysisResults.dataQuality && (
                        <div className={`mt-2 p-2 rounded ${
                          cameraAnalysisResults.dataQuality === 'very_low' ? 'bg-red-100 text-red-800 border border-red-300' :
                          cameraAnalysisResults.dataQuality === 'low' ? 'bg-yellow-100 text-yellow-800 border border-yellow-300' :
                          cameraAnalysisResults.dataQuality === 'medium' ? 'bg-yellow-50 text-yellow-700 border border-yellow-200' :
                          'bg-green-50 text-green-700 border border-green-200'
                        }`}>
                          <p className="font-medium">
                            Data Quality: {cameraAnalysisResults.dataQuality.charAt(0).toUpperCase() + cameraAnalysisResults.dataQuality.slice(1)}
                          </p>
                          {cameraAnalysisResults.analysisNote && (
                            <p className="text-sm mt-1">{cameraAnalysisResults.analysisNote}</p>
                          )}
                          {cameraAnalysisResults.framesCollected && (
                            <p className="text-xs mt-1">
                              Frames analyzed: {cameraAnalysisResults.framesCollected}
                            </p>
                          )}
                          {/* Special warning for very short recordings */}
                          {cameraAnalysisResults.dataQuality === 'very_low' && (
                            <div className="mt-2 p-2 bg-red-200 rounded">
                              <p className="font-bold">⚠️ Unreliable Results</p>
                              <p className="text-sm">The recording was too short for accurate analysis. Please record for at least 10 seconds.</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          
          {/* Submit with Camera Results */}
          {showCameraResults && (
            <div className="flex justify-end">
              <Button
                onClick={async () => {
                  // Prevent multiple simultaneous calls
                  if (isSubmittingVoiceRef.current) {
                    console.log('⚠️ Camera results submit already in progress');
                    return;
                  }
                  
                  try {
                    isSubmittingVoiceRef.current = true;
                    setIsSubmitting(true);
                    
                    // Submit the camera analysis results as the response
                    await submitResponseMutation.mutateAsync({
                      questionId: currentQuestion.id,
                      answer: (cameraAnalysisResults && cameraAnalysisResults.transcript) || textAnswer || '',
                      audioBlob: audioBlob ? await blobToBase64(audioBlob) : undefined,
                    });
                    
                    // Clear camera results after successful submission
                    setCameraAnalysisResults(null);
                    setShowCameraResults(false);
                    setTextAnswer("");
                    setAudioBlob(null);
                    
                    // Move to next question or complete interview
                    if (voiceInterview.currentQuestionNumber < maxVoiceQuestions) {
                      // Update state to show we're moving to next question
                      setVoiceInterview(prev => ({
                        ...prev,
                        currentQuestionNumber: prev.currentQuestionNumber + 1,
                        qaHistory: [...prev.qaHistory, { 
                          question: currentQuestion.question, 
                          answer: (cameraAnalysisResults && cameraAnalysisResults.transcript) || textAnswer || '' 
                        }]
                      }));
                    } else {
                      await completeInterview();
                    }
                  } catch (submitError) {
                    console.error('Error submitting camera response:', submitError);
                    toast({
                      title: "Error",
                      description: "Failed to submit response. Please try again.",
                      variant: "destructive",
                    });
                  } finally {
                    isSubmittingVoiceRef.current = false;
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </>
                ) : (
                  voiceInterview.currentQuestionNumber >= maxVoiceQuestions ? "Complete Interview" : "Submit Response"
                )}
              </Button>
            </div>
          )}
          
          {/* Voice input methods - only show if camera results are not available */}
          {!showCameraResults && (
            <>
              <div className="grid grid-cols-1 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Record Your Answer</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <VoiceRecorder
                      onRecordingComplete={(blob) => setAudioBlob(blob)}
                      disabled={isSubmitting}
                    />
                  </CardContent>
                </Card>
              </div>
              
              <div className="flex flex-col space-y-4">
                {/* Submit button */}
                <div className="flex justify-between items-center">
                  {/* Small submission status indicator */}
                  {isSubmitting && (
                    <div className="flex items-center space-x-2 text-sm text-blue-600">
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                      <span>Processing response...</span>
                    </div>
                  )}
                  
                  <Button
                    onClick={() => {
                      console.log('🔥 Voice submit clicked - User action');
                      handleVoiceSubmit();
                    }}
                    disabled={isSubmitting || (!textAnswer.trim() && !audioBlob && !showCameraResults)}
                    className="btn-primary"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Submitting...
                      </>
                    ) : (
                      voiceInterview.currentQuestionNumber >= maxVoiceQuestions ? "Complete Interview" : "Submit Response"
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      );
    }
    
    return <div className="text-center py-8 text-gray-600">Unknown stage.</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="pt-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Interview Header */}
          <Card className="mb-8">
            <CardContent className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{typedInterview.role}</h1>
                  <p className="text-gray-600">{typedInterview.experienceLevel}</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">

                    Stage {typedInterview.currentStage} of 3
                  </Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => navigate('/dashboard')}
                  >
                    Back to Dashboard
                  </Button>
                </div>
              </div>

              <div className="flex items-center space-x-4 mb-4">
                <StageIcon className={`h-5 w-5 ${currentStageInfo.color}`} />
                <span className="font-medium text-gray-900">{currentStageInfo.title}</span>
              </div>

              <Progress value={progress} className="w-full" />

              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>Progress: {Math.round(progress)}%</span>
                <span>
                  {typedInterview.currentStage === 1 && `Question ${currentQuestionIndex + 1} of ${currentStageQuestions.length}`}
                  {typedInterview.currentStage === 2 && "Coding Challenge"}
                  {typedInterview.currentStage === 3 && `Voice Question ${voiceInterview.currentQuestionNumber} of ${maxVoiceQuestions}`}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Current Question */}
          <Card className="transition-all duration-500 ease-in-out">
            <CardContent className="p-6">
              <div key={`${currentStage}-${voiceInterview.currentQuestionNumber}-${currentQuestionIndex}`} className="animate-in fade-in duration-300">
                {renderCurrentQuestion()}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}