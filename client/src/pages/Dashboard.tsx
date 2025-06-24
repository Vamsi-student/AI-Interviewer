import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Plus, 
  Clock, 
  CheckCircle, 
  TrendingUp, 
  Brain,
  Code,
  Mic,
  Trophy,
  Calendar,
  Star
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useInterview } from "@/hooks/useInterview";
import Header from "@/components/Header";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

const ROLES = [
  "Software Engineer",
  "Data Scientist", 
  "Product Manager",
  "Frontend Developer",
  "Backend Developer",
  "Full Stack Developer",
  "DevOps Engineer",
  "Marketing Manager",
  "UX Designer",
  "Sales Representative",
  "HR Specialist",
  "Business Analyst"
];

const EXPERIENCE_LEVELS = [
  "Entry Level (0-2 years)",
  "Mid Level (3-5 years)", 
  "Senior Level (6-10 years)",
  "Lead Level (10+ years)"
];

export default function Dashboard() {
  const { dbUser, loading } = useAuth();
  const { useInterviewsQuery, createInterviewMutation } = useInterview();
  const [, setLocation] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRole, setSelectedRole] = useState("");
  const [selectedExperience, setSelectedExperience] = useState("");
  const { toast } = useToast();

  const { data: interviews = [], isLoading } = useInterviewsQuery();

  if (loading || isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600">Loading your dashboard...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!dbUser) {
    setLocation("/");
    return null;
  }

  const handleCreateInterview = async () => {
    if (!selectedRole || !selectedExperience) {
      toast({
        title: "Missing Information",
        description: "Please select both role and experience level.",
        variant: "destructive",
      });
      return;
    }

    try {
      const interview = await createInterviewMutation.mutateAsync({
        role: selectedRole,
        experienceLevel: selectedExperience,
      });
      
      setModalOpen(false);
      setSelectedRole("");
      setSelectedExperience("");
      
      toast({
        title: "Interview Created!",
        description: "Your interview has been created. Starting now...",
      });
      
      setLocation(`/interview/${interview.id}`);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to create interview. Please try again.",
        variant: "destructive",
      });
    }
  };

  const completedInterviews = interviews.filter(i => i.status === 'completed');
  const inProgressInterviews = interviews.filter(i => i.status === 'in_progress');
  const averageScore = completedInterviews.length > 0 
    ? Math.round(completedInterviews.reduce((sum, i) => sum + (i.overallScore || 0), 0) / completedInterviews.length)
    : 0;

  const formatDate = (date: string | Date) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'abandoned': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStageIcon = (stage: number) => {
    switch (stage) {
      case 1: return <Brain className="h-4 w-4" />;
      case 2: return <Code className="h-4 w-4" />;
      case 3: return <Mic className="h-4 w-4" />;
      default: return <Clock className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <main className="pt-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Welcome Section */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Welcome back, {dbUser.name}!
            </h1>
            <p className="text-gray-600">
              Ready to ace your next interview? Start practicing now or review your progress.
            </p>
          </div>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Trophy className="h-6 w-6 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Total Interviews</p>
                    <p className="text-2xl font-bold text-gray-900">{interviews.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Completed</p>
                    <p className="text-2xl font-bold text-gray-900">{completedInterviews.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <Clock className="h-6 w-6 text-yellow-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">In Progress</p>
                    <p className="text-2xl font-bold text-gray-900">{inProgressInterviews.length}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-6">
                <div className="flex items-center">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-purple-600" />
                  </div>
                  <div className="ml-4">
                    <p className="text-sm font-medium text-gray-600">Avg Score</p>
                    <p className="text-2xl font-bold text-gray-900">{averageScore}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Start New Interview */}
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Plus className="h-5 w-5 mr-2" />
                  Start New Interview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 mb-4">
                  Choose your target role and experience level to begin a personalized interview practice session.
                </p>
                
                <Dialog open={modalOpen} onOpenChange={setModalOpen}>
                  <DialogTrigger asChild>
                    <Button className="w-full btn-primary">
                      Create New Interview
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Start New Interview</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="role">Target Role</Label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {role}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <div>
                        <Label htmlFor="experience">Experience Level</Label>
                        <Select value={selectedExperience} onValueChange={setSelectedExperience}>
                          <SelectTrigger className="mt-1">
                            <SelectValue placeholder="Select experience level" />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPERIENCE_LEVELS.map((level) => (
                              <SelectItem key={level} value={level}>
                                {level}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Button 
                        onClick={handleCreateInterview}
                        disabled={createInterviewMutation.isPending}
                        className="w-full btn-primary"
                      >
                        {createInterviewMutation.isPending ? "Creating..." : "Start Interview"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>

            {/* Recent Interviews */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Calendar className="h-5 w-5 mr-2" />
                  Recent Interviews
                </CardTitle>
              </CardHeader>
              <CardContent>
                {interviews.length === 0 ? (
                  <div className="text-center py-8">
                    <Brain className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-gray-600">No interviews yet</p>
                    <p className="text-sm text-gray-500">Start your first interview to see it here</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {interviews.slice(0, 5).map((interview) => (
                      <div key={interview.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                        <div className="flex items-center space-x-3">
                          <div className="p-2 bg-gray-100 rounded-lg">
                            {getStageIcon(interview.currentStage)}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{interview.role}</p>
                            <p className="text-sm text-gray-500">{interview.experienceLevel}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-3">
                          <Badge className={getStatusColor(interview.status)}>
                            {interview.status.replace('_', ' ')}
                          </Badge>
                          
                          {interview.overallScore && (
                            <div className="flex items-center space-x-1">
                              <Star className="h-4 w-4 text-yellow-500" />
                              <span className="text-sm font-medium">{interview.overallScore}%</span>
                            </div>
                          )}
                          
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (interview.status === 'completed') {
                                setLocation(`/results/${interview.id}`);
                              } else {
                                setLocation(`/interview/${interview.id}`);
                              }
                            }}
                          >
                            {interview.status === 'completed' ? 'View Results' : 'Continue'}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Performance Overview */}
          {completedInterviews.length > 0 && (
            <Card className="mt-8">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <TrendingUp className="h-5 w-5 mr-2" />
                  Performance Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="text-center">
                    <div className="text-3xl font-bold text-blue-600 mb-2">
                      {averageScore}%
                    </div>
                    <div className="text-sm text-gray-600">Average Score</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-green-600 mb-2">
                      {Math.round((completedInterviews.length / interviews.length) * 100)}%
                    </div>
                    <div className="text-sm text-gray-600">Completion Rate</div>
                  </div>
                  
                  <div className="text-center">
                    <div className="text-3xl font-bold text-purple-600 mb-2">
                      {completedInterviews.length}
                    </div>
                    <div className="text-sm text-gray-600">Interviews Completed</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
