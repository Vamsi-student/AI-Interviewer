import { useRoute, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { 
  Trophy, 
  Star, 
  TrendingUp, 
  MessageSquare, 
  Code, 
  Mic,
  Brain,
  ArrowLeft,
  Download,
  Share2,
  RotateCcw
} from "lucide-react";
import { useInterview } from "@/hooks/useInterview";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { useToast } from "@/hooks/use-toast";

export default function Results() {
  const [match, params] = useRoute("/results/:id");
  const [, setLocation] = useLocation();
  const { dbUser } = useAuth();
  const { toast } = useToast();
  
  const interviewId = params?.id ? parseInt(params.id) : null;
  const {
    useInterviewQuery,
    useQuestionsQuery,
    useResponsesQuery,
    createInterviewMutation
  } = useInterview();

  const { data: interview, isLoading: interviewLoading } = useInterviewQuery(interviewId);
  const { data: questions = [] } = useQuestionsQuery(interviewId);
  const { data: responses = [] } = useResponsesQuery(interviewId);

  if (!match) {
    setLocation("/dashboard");
    return null;
  }

  if (interviewLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading results...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!interview || !dbUser || interview.status !== 'completed') {
    setLocation("/dashboard");
    return null;
  }

  const feedback = interview.feedback || {};
  const overallScore = interview.overallScore || 0;

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-green-600";
    if (score >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBg = (score: number) => {
    if (score >= 80) return "bg-green-100";
    if (score >= 60) return "bg-yellow-100";
    return "bg-red-100";
  };

  const handleRetakeInterview = async () => {
    try {
      const newInterview = await createInterviewMutation.mutateAsync({
        role: interview.role,
        experienceLevel: interview.experienceLevel,
      });
      
      toast({
        title: "New Interview Created!",
        description: "Starting a new practice session with the same settings.",
      });
      
      setLocation(`/interview/${newInterview.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create new interview. Please try again.",
        variant: "destructive",
      });
    }
  };

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const stageStats = [
    {
      stage: 1,
      title: "MCQ Assessment",
      icon: Brain,
      responses: responses.filter(r => questions.find(q => q.id === r.questionId)?.stage === 1),
    },
    {
      stage: 2,
      title: "Coding Challenge",
      icon: Code,
      responses: responses.filter(r => questions.find(q => q.id === r.questionId)?.stage === 2),
    },
    {
      stage: 3,
      title: "Voice Interview",
      icon: Mic,
      responses: responses.filter(r => questions.find(q => q.id === r.questionId)?.stage === 3),
    }
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="pt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={() => setLocation("/dashboard")}
                className="p-2"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Interview Results</h1>
                <p className="text-gray-600">
                  {interview.role} • {interview.experienceLevel} • {formatDate(interview.completedAt!)}
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <Button variant="outline" size="sm">
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </Button>
              <Button
                onClick={handleRetakeInterview}
                disabled={createInterviewMutation.isPending}
                className="btn-primary"
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Retake Interview
              </Button>
            </div>
          </div>

          {/* Overall Score */}
          <Card className="mb-8">
            <CardContent className="p-8">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full ${getScoreBg(overallScore)} mb-4`}>
                  <Trophy className={`h-10 w-10 ${getScoreColor(overallScore)}`} />
                </div>
                <h2 className="text-4xl font-bold text-gray-900 mb-2">{overallScore}%</h2>
                <p className="text-xl text-gray-600 mb-4">Overall Interview Score</p>
                
                <div className="max-w-md mx-auto">
                  <Progress value={overallScore} className="mb-2" />
                  <p className="text-sm text-gray-500">
                    {overallScore >= 80 ? "Excellent performance!" :
                     overallScore >= 60 ? "Good job, with room for improvement" :
                     "Keep practicing, you'll get better!"}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Detailed Feedback */}
            <div className="lg:col-span-2 space-y-6">
              {/* Skills Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <TrendingUp className="h-5 w-5 mr-2" />
                    Skills Assessment
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="text-center p-4 bg-blue-50 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {feedback.communicationSkills || 0}%
                      </div>
                      <div className="text-sm text-gray-600">Communication</div>
                      <Progress value={feedback.communicationSkills || 0} className="mt-2" />
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 mb-1">
                        {feedback.technicalSkills || 0}%
                      </div>
                      <div className="text-sm text-gray-600">Technical Skills</div>
                      <Progress value={feedback.technicalSkills || 0} className="mt-2" />
                    </div>
                    
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 mb-1">
                        {feedback.confidence || 0}%
                      </div>
                      <div className="text-sm text-gray-600">Confidence</div>
                      <Progress value={feedback.confidence || 0} className="mt-2" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Stage Performance */}
              <Card>
                <CardHeader>
                  <CardTitle>Stage-by-Stage Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {stageStats.map((stage) => {
                    const StageIcon = stage.icon;
                    const stageScore = stage.responses.length > 0
                      ? Math.round(stage.responses.reduce((sum, r) => sum + (r.score || 0), 0) / stage.responses.length)
                      : 0;
                    
                    return (
                      <div key={stage.stage} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            <StageIcon className="h-5 w-5 text-gray-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{stage.title}</p>
                            <p className="text-sm text-gray-500">
                              {stage.responses.length} question{stage.responses.length !== 1 ? 's' : ''}
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <div className="w-24">
                            <Progress value={stageScore} />
                          </div>
                          <span className={`font-semibold ${getScoreColor(stageScore)}`}>
                            {stageScore}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* Detailed Feedback */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center">
                    <MessageSquare className="h-5 w-5 mr-2" />
                    AI Feedback Analysis
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-gray-700 leading-relaxed">
                      {feedback.detailedFeedback || "No detailed feedback available."}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Strengths & Weaknesses */}
            <div className="space-y-6">
              {/* Strengths */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-green-700">
                    💪 Strengths
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {feedback.strengths && feedback.strengths.length > 0 ? (
                    <ul className="space-y-2">
                      {feedback.strengths.map((strength: string, index: number) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-green-500 mt-1">✓</span>
                          <span className="text-sm text-gray-700">{strength}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No specific strengths identified.</p>
                  )}
                </CardContent>
              </Card>

              {/* Areas for Improvement */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-orange-700">
                    🎯 Areas for Improvement
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {feedback.weaknesses && feedback.weaknesses.length > 0 ? (
                    <ul className="space-y-2">
                      {feedback.weaknesses.map((weakness: string, index: number) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-orange-500 mt-1">⚠</span>
                          <span className="text-sm text-gray-700">{weakness}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No specific areas identified.</p>
                  )}
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-blue-700">
                    💡 Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {feedback.recommendations && feedback.recommendations.length > 0 ? (
                    <ul className="space-y-2">
                      {feedback.recommendations.map((recommendation: string, index: number) => (
                        <li key={index} className="flex items-start space-x-2">
                          <span className="text-blue-500 mt-1">💡</span>
                          <span className="text-sm text-gray-700">{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-gray-500">No specific recommendations available.</p>
                  )}
                </CardContent>
              </Card>

              {/* Quick Stats */}
              <Card>
                <CardHeader>
                  <CardTitle>Interview Statistics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Questions:</span>
                    <span className="font-medium">{questions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Responses:</span>
                    <span className="font-medium">{responses.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Completion Rate:</span>
                    <span className="font-medium">100%</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Started:</span>
                    <span className="text-sm">{formatDate(interview.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Completed:</span>
                    <span className="text-sm">{formatDate(interview.completedAt!)}</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
