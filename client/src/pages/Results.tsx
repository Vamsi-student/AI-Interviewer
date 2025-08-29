import { useParams, useNavigate } from "react-router-dom";
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
import { useInterview, useInterviewQuery, useQuestionsQuery, useResponsesQuery } from "@/hooks/useInterview";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useState } from "react";
import jsPDF from "jspdf";
import html2pdf from "html2pdf.js";

export default function Results() {
  const { id } = useParams();
  const interviewId = id ? parseInt(id) : null;
  const { dbUser, loading } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [shouldShowContent, setShouldShowContent] = useState(false);
  
  console.log('Results page loaded:', { interviewId, dbUser, loading });

  const { createInterviewMutation } = useInterview();

  const { data: interview, isLoading: interviewLoading } = useInterviewQuery(interviewId);
  const { data: questions = [] } = useQuestionsQuery(interviewId);
  const { data: responses = [] } = useResponsesQuery(interviewId);

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

  const handleBackNavigation = () => {
    // Try to go back in browser history first, fallback to dashboard
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/dashboard');
    }
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
      
      setShouldShowContent(true);
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
      responses: responses.filter((r: any) => questions.find((q: any) => q.id === r.questionId)?.stage === 1),
    },
    {
      stage: 2,
      title: "Coding Challenge",
      icon: Code,
      responses: responses.filter((r: any) => questions.find((q: any) => q.id === r.questionId)?.stage === 2),
    },
    {
      stage: 3,
      title: "Voice Interview",
      icon: Mic,
      responses: responses.filter((r: any) => questions.find((q: any) => q.id === r.questionId)?.stage === 3),
    }
  ];

  const handleDownloadPDF = () => {
    const element = document.getElementById("results-pdf-content");
    if (!element) return;
    html2pdf().from(element).set({
      margin: 0.5,
      filename: "AI_Interview_Results.pdf",
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" }
    }).save();
  };

  const handleShare = async () => {
    const element = document.getElementById("results-pdf-content");
    if (!element) return;
    const opt = {
      margin: 0.5,
      filename: "AI_Interview_Results.pdf",
      html2canvas: { scale: 2 },
      jsPDF: { unit: "in", format: "a4", orientation: "portrait" }
    };
    // Generate PDF as Blob
    const worker = html2pdf().from(element).set(opt).outputPdf("blob");
    const pdfBlob = await worker;
    const file = new File([pdfBlob], "AI_Interview_Results.pdf", { type: "application/pdf" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "AI Interview Results",
          text: `Check out my AI Interview Results for ${interview.role} (${interview.experienceLevel})!`
        });
        toast({ title: "Shared!", description: "PDF shared successfully." });
      } catch (e) {
        toast({ title: "Share cancelled", description: "You cancelled sharing." });
      }
    } else {
      // Fallback: download the PDF
      html2pdf().from(element).set(opt).save();
      toast({ title: "PDF Downloaded!", description: "PDF downloaded as sharing is not supported." });
    }
  };

  const communicationSkills = feedback.communicationSkills ?? 0;
  const technicalSkills = feedback.technicalSkills ?? 0;
  const confidence = feedback.confidence ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="pt-16">
        <div id="results-pdf-content" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center space-x-4">
              <Button
                variant="ghost"
                onClick={handleBackNavigation}
                className="p-2 hover:bg-gray-100"
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
              <Button variant="outline" size="sm" onClick={handleShare}>
                <Share2 className="h-4 w-4 mr-2" />
                Share
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
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

          {/* Tabbed Question Review Section */}
          <div className="bg-white rounded-xl shadow p-4 sm:p-6 mb-6">
            <Tabs defaultValue="mcq" className="w-full">
              <TabsList className="flex flex-wrap gap-2 mb-4">
                <TabsTrigger value="mcq">MCQ</TabsTrigger>
                <TabsTrigger value="coding">Coding</TabsTrigger>
                <TabsTrigger value="voice">Voice</TabsTrigger>
              </TabsList>
              {/* MCQ Tab */}
              <TabsContent value="mcq">
                {questions.filter((q: any) => q.stage === 1).length === 0 ? (
                  <div className="text-gray-500 text-center">No MCQ questions found.</div>
                ) : (
                  <div className="space-y-4">
                    {questions.filter((q: any) => q.stage === 1).map((q: any, idx: number) => {
                      const response = responses.find((r: any) => r.questionId === q.id);
                      return (
                        <div key={q.id} className="border rounded-lg p-4">
                          <div className="font-semibold mb-2">Q{idx + 1}: {q.question}</div>
                          <div className="mb-1"><span className="font-medium">Your Answer:</span> {response?.answer || <span className="text-gray-400">No answer</span>}</div>
                          <div className="mb-1"><span className="font-medium">Correct Answer:</span> {q.correctAnswer || <span className="text-gray-400">N/A</span>}</div>
                          <div className="mb-1"><span className="font-medium">Score:</span> {response?.score ?? 'N/A'}</div>
                          <div className="text-sm text-gray-600"><span className="font-medium">Feedback:</span> {typeof response?.feedback === 'string' ? response.feedback : response?.feedback?.feedback || <span className="text-gray-400">No feedback</span>}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
              {/* Coding Tab */}
              <TabsContent value="coding">
                {questions.filter((q: any) => q.stage === 2).length === 0 ? (
                  <div className="text-gray-500 text-center">No coding questions found.</div>
                ) : (
                  <div className="space-y-4">
                    {questions.filter((q: any) => q.stage === 2).map((q: any, idx: number) => {
                      const response = responses.find((r: any) => r.questionId === q.id);
                      return (
                        <div key={q.id} className="border rounded-lg p-4">
                          <div className="font-semibold mb-2">
                            Q{idx + 1}: {(() => {
                              let questionObj = q.question;
                              if (typeof q.question === 'string') {
                                try {
                                  questionObj = JSON.parse(q.question);
                                } catch (e) {
                                  // fallback to string
                                  return q.question;
                                }
                              }
                              if (typeof questionObj === 'object' && questionObj !== null) {
                                return <>
                                  {questionObj.title && <span>{questionObj.title}</span>}
                                  {questionObj.description && <div className="text-sm font-normal text-gray-700 mt-1">{questionObj.description}</div>}
                                  {questionObj.difficulty && <div className="text-xs text-gray-500 mt-1"><b>Difficulty:</b> {questionObj.difficulty}</div>}
                                  {questionObj.constraints && <div className="text-xs text-gray-500 mt-1"><b>Constraints:</b> {questionObj.constraints}</div>}
                                  {questionObj.examples && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      <b>Examples:</b>
                                      <pre className="bg-gray-50 rounded p-2 mt-1 whitespace-pre-wrap">
                                        {(() => {
                                          if (typeof questionObj.examples === 'string') return questionObj.examples;
                                          if (Array.isArray(questionObj.examples)) {
                                            return questionObj.examples.map((ex: any, i: number) => {
                                              if (typeof ex === 'object' && ex !== null) {
                                                return Object.entries(ex).map(([k, v]) => `${k}: ${v}`).join('\n') + (i < questionObj.examples.length - 1 ? '\n\n' : '');
                                              }
                                              return String(ex);
                                            }).join('');
                                          }
                                          if (typeof questionObj.examples === 'object' && questionObj.examples !== null) {
                                            return Object.entries(questionObj.examples).map(([k, v]) => `${k}: ${v}`).join('\n');
                                          }
                                          return '';
                                        })()}
                                      </pre>
                                    </div>
                                  )}
                                </>;
                              }
                              return q.question;
                            })()}
                          </div>
                          <div className="mb-1"><span className="font-medium">Your Answer:</span> 
                            <pre className="bg-gray-100 rounded p-2 overflow-x-auto text-xs whitespace-pre-wrap">
                              {(() => {
                                if (!response?.answer) return 'No answer';
                                try {
                                  // Try to parse if it's a JSON string with a code property
                                  const parsed = JSON.parse(response.answer);
                                  if (typeof parsed === 'object' && parsed !== null && parsed.code) {
                                    return parsed.code;
                                  }
                                } catch (e) {}
                                // Otherwise, just show as plain text
                                return response.answer;
                              })()}
                            </pre>
                          </div>
                          <div className="mb-1"><span className="font-medium">Score:</span> {response?.score ?? 'N/A'}</div>
                          <div className="text-sm text-gray-600 mb-2"><span className="font-medium">Feedback:</span> {typeof response?.feedback === 'string' ? response.feedback : response?.feedback?.feedback || <span className="text-gray-400">No feedback</span>}</div>
                          {/* Show test case results if available */}
                          {response?.feedback?.testCaseResults && Array.isArray(response.feedback.testCaseResults) && response.feedback.testCaseResults.length > 0 && (
                            <div className="mt-2">
                              <div className="font-medium mb-1">Test Case Results:</div>
                              <div className="overflow-x-auto">
                                <table className="min-w-full text-xs border">
                                  <thead>
                                    <tr className="bg-gray-100">
                                      <th className="px-2 py-1 border">#</th>
                                      <th className="px-2 py-1 border">Input</th>
                                      <th className="px-2 py-1 border">Your Output</th>
                                      <th className="px-2 py-1 border">Expected Output</th>
                                      <th className="px-2 py-1 border">Result</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {response.feedback.testCaseResults.map((tc: any, i: number) => (
                                      <tr key={i} className={tc.passed ? 'bg-green-50' : 'bg-red-50'}>
                                        <td className="px-2 py-1 border text-center">{i + 1}</td>
                                        <td className="px-2 py-1 border font-mono whitespace-pre-wrap">{tc.input}</td>
                                        <td className="px-2 py-1 border font-mono whitespace-pre-wrap">{tc.output}</td>
                                        <td className="px-2 py-1 border font-mono whitespace-pre-wrap">{tc.expectedOutput}</td>
                                        <td className="px-2 py-1 border text-center font-bold">{tc.passed ? <span className="text-green-600">✔</span> : <span className="text-red-600">✗</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
              {/* Voice Tab */}
              <TabsContent value="voice">
                {questions.filter((q: any) => q.stage === 3).length === 0 ? (
                  <div className="text-gray-500 text-center">No voice questions found.</div>
                ) : (
                  <div className="space-y-4">
                    {questions.filter((q: any) => q.stage === 3).map((q: any, idx: number) => {
                      const response = responses.find((r: any) => r.questionId === q.id);
                      return (
                        <div key={q.id} className="border rounded-lg p-4">
                          <div className="font-semibold mb-2">Q{idx + 1}: {q.question}</div>
                          <div className="mb-1"><span className="font-medium">Your Answer:</span> {response?.answer || <span className="text-gray-400">No answer</span>}</div>
                          <div className="mb-1"><span className="font-medium">Score:</span> {response?.score ?? 'N/A'}</div>
                          <div className="text-sm text-gray-600"><span className="font-medium">Feedback:</span> {typeof response?.feedback === 'string' ? response.feedback : response?.feedback?.feedback || <span className="text-gray-400">No feedback</span>}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

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
                        {communicationSkills}%
                      </div>
                      <div className="text-sm text-gray-600">Communication</div>
                      <Progress value={communicationSkills} className="mt-2" />
                    </div>
                    
                    <div className="text-center p-4 bg-green-50 rounded-lg">
                      <div className="text-2xl font-bold text-green-600 mb-1">
                        {technicalSkills}%
                      </div>
                      <div className="text-sm text-gray-600">Technical Skills</div>
                      <Progress value={technicalSkills} className="mt-2" />
                    </div>
                    
                    <div className="text-center p-4 bg-purple-50 rounded-lg">
                      <div className="text-2xl font-bold text-purple-600 mb-1">
                        {confidence}%
                      </div>
                      <div className="text-sm text-gray-600">Confidence</div>
                      <Progress value={confidence} className="mt-2" />
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
                      ? Math.round(stage.responses.reduce((sum: number, r: any) => sum + (r.score || 0), 0) / stage.responses.length)
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
                    <span className="font-medium">{(responses.length / questions.length * 100).toFixed(2)}%</span>
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
