import { useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { 
  Brain, 
  Code, 
  Mic, 
  ArrowRight, 
  CheckCircle, 
  Clock,
  Volume2,
  VolumeX
} from "lucide-react";
import { useInterview } from "@/hooks/useInterview";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import CodeEditor from "@/components/CodeEditor";
import VoiceRecorder from "@/components/VoiceRecorder";
import { useToast } from "@/hooks/use-toast";

export default function Interview() {
  const [match, params] = useRoute("/interview/:id");
  const [, setLocation] = useLocation();
  const { dbUser } = useAuth();
  const { toast } = useToast();
  
  const interviewId = params?.id ? parseInt(params.id) : null;
  const {
    useInterviewQuery,
    useQuestionsQuery,
    useResponsesQuery,
    updateInterviewMutation,
    submitResponseMutation,
    generateVoiceQuestionMutation,
    completeInterviewMutation
  } = useInterview();

  const { data: interview, isLoading: interviewLoading } = useInterviewQuery(interviewId);
  const { data: questions = [], isLoading: questionsLoading } = useQuestionsQuery(interviewId);
  const { data: responses = [] } = useResponsesQuery(interviewId);

  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [textAnswer, setTextAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  if (!match) {
    setLocation("/dashboard");
    return null;
  }

  if (interviewLoading || questionsLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading interview...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!interview || !dbUser) {
    setLocation("/dashboard");
    return null;
  }

  const currentStage = interview?.currentStage || 1;
  const currentStageQuestions = questions.filter(q => q.stage === currentStage);
  const currentQuestion = currentStageQuestions[currentQuestionIndex];

  const stageInfo = {
    1: { title: "Multiple Choice Questions", icon: Brain, color: "text-blue-600" },
    2: { title: "Coding Challenge", icon: Code, color: "text-green-600" },
    3: { title: "Voice Interview", icon: Mic, color: "text-purple-600" }
  };

  const currentStageInfo = stageInfo[currentStage as keyof typeof stageInfo] || stageInfo[1];
  const StageIcon = currentStageInfo.icon;

  const progress = ((currentStage - 1) * 33.33) + 
    ((currentQuestionIndex / Math.max(currentStageQuestions.length, 1)) * 33.33);

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

  const stopSpeaking = () => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  };

  const handleMCQSubmit = async () => {
    if (!selectedAnswer) {
      toast({
        title: "Please select an answer",
        description: "Choose one of the options before continuing.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await submitResponseMutation.mutateAsync({
        questionId: currentQuestion.id,
        answer: selectedAnswer,
      });

      setSelectedAnswer("");
      
      if (currentQuestionIndex < currentStageQuestions.length - 1) {
        setCurrentQuestionIndex(prev => prev + 1);
      } else {
        await moveToNextStage();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit answer. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
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

  const handleVoiceSubmit = async (audioBlob?: Blob) => {
    if (!textAnswer && !audioBlob) {
      toast({
        title: "Please provide an answer",
        description: "Either type your answer or record an audio response.",
        variant: "destructive",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const audioBase64 = audioBlob ? await blobToBase64(audioBlob) : undefined;
      
      await submitResponseMutation.mutateAsync({
        questionId: currentQuestion.id,
        answer: textAnswer,
        audioBlob: audioBase64,
      });

      setTextAnswer("");
      
      // Generate next voice question or complete interview
      const voiceResponses = responses.filter(r => 
        questions.find(q => q.id === r.questionId)?.stage === 3
      );
      
      if (voiceResponses.length < 4) { // Limit voice questions to 5 total
        try {
          const newQuestion = await generateVoiceQuestionMutation.mutateAsync(interview.id);
          // Refresh questions
          window.location.reload();
        } catch (error) {
          // If we can't generate more questions, complete the interview
          await completeInterview();
        }
      } else {
        await completeInterview();
      }
    } catch (error) {
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

  const moveToNextStage = async () => {
    const nextStage = interview.currentStage + 1;
    
    // Skip coding stage for non-technical roles
    const technicalRoles = ['software engineer', 'developer', 'data scientist', 'sre', 'devops'];
    const isTechnical = technicalRoles.some(role => 
      interview.role.toLowerCase().includes(role.toLowerCase())
    );

    if (nextStage === 2 && !isTechnical) {
      // Skip coding stage, go to voice interview
      await updateInterviewMutation.mutateAsync({
        id: interview.id,
        data: { currentStage: 3 }
      });
      
      // Generate first voice question
      await generateVoiceQuestionMutation.mutateAsync(interview.id);
      window.location.reload();
    } else if (nextStage <= 3) {
      await updateInterviewMutation.mutateAsync({
        id: interview.id,
        data: { currentStage: nextStage }
      });
      
      if (nextStage === 3) {
        // Generate first voice question
        await generateVoiceQuestionMutation.mutateAsync(interview.id);
      }
      
      setCurrentQuestionIndex(0);
      window.location.reload();
    } else {
      await completeInterview();
    }
  };

  const completeInterview = async () => {
    try {
      await completeInterviewMutation.mutateAsync(interview.id);
      toast({
        title: "Interview Complete!",
        description: "Generating your results...",
      });
      setLocation(`/results/${interview.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to complete interview.",
        variant: "destructive",
      });
    }
  };

  const renderCurrentQuestion = () => {
    if (!currentQuestion) {
      if (interview.currentStage === 3) {
        // Generate first voice question
        generateVoiceQuestionMutation.mutate(interview.id);
      }
      return (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-gray-600">Generating questions...</p>
        </div>
      );
    }

    switch (interview.currentStage) {
      case 1: // MCQ
        const mcqData = typeof currentQuestion.question === 'string' 
          ? { question: currentQuestion.question, options: currentQuestion.options || [] }
          : currentQuestion.question;
        
        return (
          <div className="space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-4">
                Question {currentQuestionIndex + 1} of {currentStageQuestions.length}
              </h3>
              <p className="text-gray-700 mb-6">{mcqData.question}</p>
              
              <RadioGroup value={selectedAnswer} onValueChange={setSelectedAnswer}>
                <div className="space-y-3">
                  {mcqData.options.map((option: string, index: number) => (
                    <div key={index} className="flex items-center space-x-2">
                      <RadioGroupItem value={option} id={`option-${index}`} />
                      <Label htmlFor={`option-${index}`} className="flex-1 cursor-pointer">
                        {option}
                      </Label>
                    </div>
                  ))}
                </div>
              </RadioGroup>
            </div>
            
            <div className="flex justify-end">
              <Button
                onClick={handleMCQSubmit}
                disabled={isSubmitting}
                className="btn-primary"
              >
                {isSubmitting ? "Submitting..." : "Submit Answer"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      case 2: // Coding
        return (
          <CodeEditor
            question={currentQuestion}
            onSubmit={handleCodingSubmit}
            disabled={isSubmitting}
          />
        );

      case 3: // Voice
        return (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-primary to-purple-500 rounded-full flex items-center justify-center">
                    <span className="text-white">🤖</span>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">AI Interviewer</p>
                    <p className="text-sm text-gray-600">Voice Question</p>
                  </div>
                </div>
                
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => speakText(currentQuestion.question)}
                    disabled={isSpeaking}
                  >
                    <Volume2 className="h-4 w-4" />
                  </Button>
                  {isSpeaking && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={stopSpeaking}
                    >
                      <VolumeX className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="bg-white rounded-lg p-4 mb-4">
                <p className="text-gray-700">{currentQuestion.question}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Text Answer */}
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

              {/* Voice Answer */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Record Your Answer</CardTitle>
                </CardHeader>
                <CardContent>
                  <VoiceRecorder
                    onRecordingComplete={(blob) => handleVoiceSubmit(blob)}
                    disabled={isSubmitting}
                  />
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => handleVoiceSubmit()}
                disabled={isSubmitting || (!textAnswer.trim())}
                className="btn-primary"
              >
                {isSubmitting ? "Submitting..." : "Submit Response"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        );

      default:
        return <div>Unknown stage</div>;
    }
  };

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
                  <h1 className="text-2xl font-bold text-gray-900">{interview.role}</h1>
                  <p className="text-gray-600">{interview.experienceLevel}</p>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Stage {interview.currentStage} of 3
                </Badge>
              </div>
              
              <div className="flex items-center space-x-4 mb-4">
                <StageIcon className={`h-5 w-5 ${currentStageInfo.color}`} />
                <span className="font-medium text-gray-900">{currentStageInfo.title}</span>
              </div>
              
              <Progress value={progress} className="w-full" />
              
              <div className="flex justify-between text-sm text-gray-500 mt-2">
                <span>Progress: {Math.round(progress)}%</span>
                <span>
                  {interview.currentStage === 1 && `Question ${currentQuestionIndex + 1} of ${currentStageQuestions.length}`}
                  {interview.currentStage === 2 && "Coding Challenge"}
                  {interview.currentStage === 3 && "Voice Interview"}
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Current Question */}
          <Card>
            <CardContent className="p-6">
              {renderCurrentQuestion()}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
