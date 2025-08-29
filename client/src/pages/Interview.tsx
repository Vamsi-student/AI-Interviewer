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
  ArrowRight,
  Square,
  RefreshCw,
  Clock,
  AlertTriangle
} from "lucide-react";
import { useInterviewQuery, useQuestionsQuery, useResponsesQuery } from "../hooks/useInterview";
import { useInterview } from "../hooks/useInterview";
import { useAuth } from "../hooks/useAuth";
import Header from "../components/Header";
import VoiceRecorder from "../components/VoiceRecorder";
import { useToast } from "../hooks/use-toast";
import { useTimer } from "../hooks/useTimer";
import type { Interview, Question, Response } from "../types/interview";

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
      // For voice stage, get questions in order they were created
      const voiceQuestions = currentStageQuestions.sort((a, b) => 
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const questionIndex = voiceInterview.currentQuestionNumber - 1;
      return voiceQuestions[questionIndex] || null;
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
    
    if (typedInterview?.id) {
      localStorage.removeItem(`voice-interview-${typedInterview.id}`);
    }
  }, [typedInterview?.id]);

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

  // Function to generate voice question
  const generateVoiceQuestion = useCallback(async (questionNumber: number, qaHistory: Array<{question: string, answer: string}>) => {
    if (!typedInterview?.id || isGeneratingRef.current) {
      console.log('⚠️ Skipping question generation - already in progress or no interview');
      return null;
    }

    console.log('🎤 Generating voice question:', { questionNumber, qaHistory: qaHistory.length });
    
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
      isGeneratingRef.current = false;
      setVoiceInterview(prev => ({ ...prev, isGenerating: false }));
    }
  }, [typedInterview?.id, getToken, toast]);

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
      const isTechnical = technicalRoles.some(role =>
        typedInterview && typedInterview.role ? normalizeRole(typedInterview.role).includes(normalizeRole(role)) : false
      );

      if (nextStage === 2 && !isTechnical) {
        await updateInterviewMutation.mutateAsync({
          id: typedInterview?.id ?? 0,
          data: { currentStage: 3 }
        });
        setCurrentQuestionIndex(0);
        resetVoiceInterviewState();
        // Navigate after a short delay to avoid race conditions
        setTimeout(() => {
          navigate(`/interview/${typedInterview?.id}`);
          transitioningRef.current = false;
        }, 100);
      } else if (nextStage === 2) {
        await updateInterviewMutation.mutateAsync({
          id: typedInterview?.id ?? 0,
          data: { currentStage: nextStage }
        });
        setCurrentQuestionIndex(0);
        // Navigate after a short delay to avoid race conditions
        setTimeout(() => {
          navigate(`/interview/${typedInterview?.id}/coding`);
          transitioningRef.current = false;
        }, 100);
      } else if (nextStage === 3) {
        await updateInterviewMutation.mutateAsync({
          id: typedInterview?.id ?? 0,
          data: { currentStage: nextStage }
        });
        setCurrentQuestionIndex(0);
        resetVoiceInterviewState();
        // Navigate after a short delay to avoid race conditions
        setTimeout(() => {
          navigate(`/interview/${typedInterview?.id}`);
          transitioningRef.current = false;
        }, 100);
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
        void moveToNextStage();
      }

      // Fire submitResponseMutation.mutate with onError
      submitResponseMutation.mutate(
        { questionId: qid, answer: ans },
        {
          onError: (error) => {
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
        void moveToNextStage();
      }

      // Fire submitResponseMutation.mutate with onError
      submitResponseMutation.mutate(
        { questionId: qid, answer: "Question skipped due to time limit" },
        {
          onError: (error) => {
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
      // Only reset question index if questions changed significantly
      if (questions.length > 0 && currentStage !== 3) {
        setCurrentQuestionIndex(0);
      }
    } else {
      // Clear stale data if no questions exist
      setAllQuestions([]);
      if (currentStage !== 3) {
        setCurrentQuestionIndex(0);
      }
    }
  }, [questions, currentStage]);

  useEffect(() => {
    if (typedInterview && typedInterview.currentStage === 2 && !transitioningRef.current) {
      const currentPath = window.location.pathname;
      const isOnCodingPage = currentPath.includes('/coding');

      // Only redirect if we're NOT already on the coding page
      if (!isOnCodingPage) {
        navigate(`/interview/${typedInterview.id}/coding`);
      }
    }
  }, [typedInterview, navigate]);

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
      // Clear the URL parameter
      window.history.replaceState({}, '', window.location.pathname);

      // Force refresh of interview and questions data
      if (typeof refetch === 'function') refetch();
      if (typeof refetchQuestions === 'function') refetchQuestions();
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
    }
  }, [currentStage, resetVoiceInterviewState]);

  // MAIN VOICE INTERVIEW LOGIC - Generate first question when entering stage 3
  useEffect(() => {
    const initializeVoiceInterview = async () => {
      console.log('🎤 Voice interview initialization check:', {
        currentStage,
        hasQuestions: currentStageQuestions.length > 0,
        isGenerating: voiceInterview.isGenerating,
        questionNumber: voiceInterview.currentQuestionNumber
      });

      // Only initialize if we're in stage 3, have no questions, and haven't generated yet
      if (currentStage === 3 && 
          currentStageQuestions.length === 0 && 
          !voiceInterview.isGenerating &&
          voiceInterview.currentQuestionNumber === 1) {
        
        console.log('🚨 Initializing voice interview - generating welcome question');
        await generateVoiceQuestion(1, []);
      }
    };

    initializeVoiceInterview();
  }, [currentStage, currentStageQuestions.length, voiceInterview.isGenerating, voiceInterview.currentQuestionNumber, generateVoiceQuestion]);

  // Speak current question when it changes (voice stage only)
  useEffect(() => {
    if (currentStage === 3 && currentQuestion && currentQuestion.question) {
      speakText(currentQuestion.question);
    }
  }, [currentStage, currentQuestion?.id]);

  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
        setIsSpeaking(false);
      }
    };
  }, [currentQuestion?.id]);

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
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.9;
      utterance.pitch = 1;
      utterance.onstart = () => setIsSpeaking(true);
      utterance.onend = () => setIsSpeaking(false);
      window.speechSynthesis.speak(utterance);
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
    
    // Mark question as answered
    setMcqStatusById(prev => ({ ...prev, [currentQuestion.id]: 'answered' }));
    
    // Snapshot qid and ans
    const qid = currentQuestion.id;
    const ans = selectedAnswer;
    
    // Advance to next question (or stage) immediately
    if (currentQuestionIndex < currentStageQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      setSelectedAnswer("");
    } else {
      moveToNextStage();
    }
    
    // Fire-and-forget submission in background
    submitResponseMutation.mutate(
      { questionId: qid, answer: ans },
      { 
        onError: (error) => {
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
    if (!currentQuestion) {
      toast({
        title: "No question found",
        description: "Please refresh the page and try again.",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmitting(true);
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
    
    try {
      let audioBase64;
      const finalBlob = blob || audioBlob;
      if (finalBlob) {
        audioBase64 = await blobToBase64(finalBlob);
      }
      
      console.log('🎤 Submitting voice response:', {
        questionId: currentQuestion.id,
        currentQuestionNumber: voiceInterview.currentQuestionNumber,
        answerLength: textAnswer.length,
        hasAudio: !!audioBase64
      });
      
      // Submit the response
      await submitResponseMutation.mutateAsync({
        questionId: currentQuestion.id,
        answer: textAnswer,
        audioBlob: audioBase64,
      });
      
      // Prepare updated Q&A history with the latest response
      const newQA = { question: currentQuestion.question, answer: textAnswer };
      const updatedVoiceQA = [...voiceInterview.qaHistory, newQA];
      
      // Clear form
      setTextAnswer("");
      setAudioBlob(null);
      
      // Check if we should generate next question or complete interview
      const nextQuestionNumber = voiceInterview.currentQuestionNumber + 1;
      
      console.log('🔍 Voice submission completed:', {
        currentNumber: voiceInterview.currentQuestionNumber,
        nextNumber: nextQuestionNumber,
        maxQuestions: maxVoiceQuestions,
        willContinue: nextQuestionNumber <= maxVoiceQuestions
      });
      
      if (nextQuestionNumber <= maxVoiceQuestions) {
        // Update state to show we're moving to next question
        setVoiceInterview(prev => ({
          ...prev,
          currentQuestionNumber: nextQuestionNumber,
          qaHistory: updatedVoiceQA
        }));
        
        // Generate next question
        await generateVoiceQuestion(nextQuestionNumber, updatedVoiceQA);
      } else {
        console.log('✅ Voice interview completed - all questions answered');
        await completeInterview();
      }
    } catch (error) {
      console.error('Voice submission error:', error);
      toast({
        title: "Error",
        description: "Failed to submit response. Please try again.",
        variant: "destructive",
      });
    } finally {
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
    if (!currentStageQuestions || currentStageQuestions.length === 0) {
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
          <div>
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <h3 className="text-lg font-semibold">Question {currentQuestionIndex + 1} of {currentStageQuestions.length}</h3>
                  {/* Show indicator if previous question was skipped */}
                  {currentQuestionIndex > 0 && currentStageQuestions[currentQuestionIndex - 1] && 
                   mcqStatusById[currentStageQuestions[currentQuestionIndex - 1].id] === 'skipped' && (
                    <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 bg-orange-50">
                      Previous: Skipped
                    </Badge>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  <Progress value={(currentQuestionIndex / currentStageQuestions.length) * 100} className="w-24 h-2" />
                  <span className="text-sm text-gray-500">{Math.round((currentQuestionIndex / currentStageQuestions.length) * 100)}%</span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1">
                  <Clock className="h-4 w-4 text-gray-500" />
                  <span className="text-xs text-gray-500">Time:</span>
                </div>
                <div className="relative">
                  {/* Circular timer progress indicator */}
                  <svg className="w-4 h-4 transform -rotate-90" viewBox="0 0 16 16">
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      className="text-gray-200"
                    />
                    <circle
                      cx="8"
                      cy="8"
                      r="6"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      fill="none"
                      strokeDasharray={`${(mcqTimer.timeRemaining / 60) * 37.7} 37.7`}
                      className={`transition-all duration-1000 ${mcqTimer.isWarning ? 'text-red-500' : 'text-blue-500'}`}
                    />
                  </svg>
                </div>
                <span className={`font-mono text-lg transition-all duration-300 ${mcqTimer.isWarning ? 'text-red-600 font-bold scale-110' : 'text-gray-700'}`}>
                  {mcqTimer.formatTime()}
                </span>

                {mcqTimer.isWarning && (
                  <div className="flex items-center space-x-1">
                    <AlertTriangle className="h-4 w-4 text-red-500 animate-pulse" />
                    <span className="text-xs text-red-600 font-medium animate-pulse">Hurry!</span>
                  </div>
                )}
              </div>
            </div>
            {/* Timer progress bar */}
            <div className="w-full mb-4">
              <Progress 
                value={((60 - mcqTimer.timeRemaining) / 60) * 100} 
                className="h-1" 
                style={{
                  '--progress-color': mcqTimer.isWarning ? '#dc2626' : '#3b82f6'
                } as React.CSSProperties}
              />
            </div>
            <p className="text-gray-700 mb-6">{currentQuestion.question}</p>
            <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
              <div className="space-y-3">
                {Array.isArray(currentQuestion.options) && currentQuestion.options.map(function(option: string, index: number) {
                  return (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  );
                })}
              </div>
            </RadioGroup>
          </div>
          <div className="flex justify-between items-center">
            <Button
              onClick={handleMCQSubmit}
              disabled={!selectedAnswer}
              className="btn-primary"
            >
              Submit Answer
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
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
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <div className="font-semibold text-gray-900 mb-2 flex items-center justify-between">
              <div className="flex items-center space-x-4">
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
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Type Your Answer</CardTitle>
              </CardHeader>
              <CardContent>
                <Textarea
                  value={textAnswer}
                  onChange={(e) => setTextAnswer(e.target.value)}
                  placeholder="Type your response here..."
                  className="min-h-32"
                  disabled={isSubmitting}
                />
              </CardContent>
            </Card>
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
                disabled={isSubmitting || (!textAnswer.trim() && !audioBlob)}
                className="btn-primary"
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Submitting...
                  </>
                ) : (
                  voiceInterview.currentQuestionNumber === maxVoiceQuestions ? "Complete Interview" : "Submit Response"
                )}
              </Button>
            </div>
          </div>
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