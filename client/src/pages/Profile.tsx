import { useNavigate } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { 
  User, 
  Mail, 
  Settings,
  Edit,
  Save,
  Clock,
  CheckCircle,
  Camera,
  Award,
  BarChart3,
  RefreshCcw,
  Shield,
  Loader2
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useInterviewsQuery } from "@/hooks/useInterview";
import Header from "@/components/Header";
import { useToast } from "@/hooks/use-toast";
import { Interview } from "@/types/interview";
import { auth } from "@/lib/firebase";
import { signOut } from "firebase/auth";
import { getAuthToken } from "@/lib/auth";

// New component for interview statistics
const ProfileStats = ({ interviews }: { interviews: Interview[] }) => {
  const interviewsCompleted = interviews.filter(i => i.status === 'completed').length;
  const averageScore = interviewsCompleted > 0
    ? Math.round(interviews.reduce((sum, i) => sum + (i.overallScore || 0), 0) / interviewsCompleted)
    : 0;

  const totalTime = interviews.reduce((sum, i) => sum + (i.durationMinutes || 0), 0);
  const totalTimeStr = `${Math.floor(totalTime / 60)}h ${totalTime % 60}m`;

  return (
    <Card className="shadow-lg rounded-2xl overflow-hidden">
      <div className="bg-gradient-to-r from-purple-500 to-blue-500 p-4">
        <span className="text-white text-lg font-semibold flex items-center">
          <BarChart3 className="h-5 w-5 mr-2" /> Your Statistics
        </span>
      </div>
      <CardContent className="flex flex-col sm:flex-row justify-between items-center py-4 sm:py-6 gap-4 sm:gap-6">
        <div className="flex flex-col items-center w-full sm:w-auto">
          <CheckCircle className="h-7 w-7 sm:h-8 sm:w-8 text-blue-500 mb-1" />
          <div className="text-xl sm:text-2xl font-bold">{interviewsCompleted}</div>
          <div className="text-gray-500 text-xs sm:text-sm">Interviews Completed</div>
        </div>
        <div className="flex flex-col items-center w-full sm:w-auto">
          <Award className="h-7 w-7 sm:h-8 sm:w-8 text-green-500 mb-1" />
          <div className="text-xl sm:text-2xl font-bold">{averageScore}%</div>
          <div className="text-gray-500 text-xs sm:text-sm">Average Score</div>
        </div>
        <div className="flex flex-col items-center w-full sm:w-auto">
          <Clock className="h-7 w-7 sm:h-8 sm:w-8 text-purple-500 mb-1" />
          <div className="text-xl sm:text-2xl font-bold">{totalTimeStr}</div>
          <div className="text-gray-500 text-xs sm:text-sm">Total Time Spent</div>
        </div>
      </CardContent>
    </Card>
  );
};

// New component for recent activity
const RecentActivity = ({ interviews }: { interviews: Interview[] }) => (
  <Card className="shadow-lg rounded-2xl">
    <CardHeader>
      <CardTitle className="flex items-center text-purple-600 text-base sm:text-lg">
        <Award className="h-5 w-5 mr-2" /> Recent Activity
      </CardTitle>
    </CardHeader>
    <CardContent className="space-y-3">
      {interviews.length === 0 ? (
        <div className="text-gray-500 text-xs sm:text-sm">No recent activity.</div>
      ) : (
        <ul className="space-y-2">
          {interviews
            .slice()
            .sort((a, b) => new Date(b.createdAt as any).getTime() - new Date(a.createdAt as any).getTime())
            .slice(0, 5)
            .map((interview) => (
              <li
                key={interview.id}
                className="flex items-center justify-between border-b border-gray-100 pb-2 last:border-0"
              >
                <div className="flex flex-col">
                  <span className="font-medium text-sm sm:text-base">{interview.role}</span>
                  <span className="text-xs text-gray-500">
                    {(interview.status === "in_progress" ? "In Progress" : "Completed") +
                      " · " +
                      new Date(interview.createdAt as any).toLocaleDateString()}
                  </span>
                </div>
                <Badge
                  variant={interview.status === "completed" ? "default" : "outline"}
                  className={
                    interview.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : "bg-yellow-100 text-yellow-700"
                  }
                >
                  {interview.status === "completed" ? "Completed" : "In Progress"}
                </Badge>
              </li>
            ))}
        </ul>
      )}
    </CardContent>
  </Card>
);

export default function Profile() {
  const { user, dbUser, loading, setDbUser } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Set up automatic refetching every 30 seconds for real-time updates
  const { data: interviews = [], refetch, isFetching } = useInterviewsQuery();
  const typedInterviews = interviews as Interview[];

  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: "",
    bio: "",
    profileImage: ""
  });
  const [optimisticProfile, setOptimisticProfile] = useState(profileForm);

  // Set up interval for automatic refetching
  useEffect(() => {
    // Refetch interviews data every 30 seconds to keep stats updated in real-time
    const interval = setInterval(() => {
      refetch();
    }, 30000); // 30 seconds

    // Clean up interval on component unmount
    return () => clearInterval(interval);
  }, [refetch]);

  useEffect(() => {
    if (dbUser) {
      setProfileForm({
        name: dbUser.name || "",
        bio: dbUser.bio || "",
        profileImage: dbUser.profileImage || ""
      });
      setOptimisticProfile({
        name: dbUser.name || "",
        bio: dbUser.bio || "",
        profileImage: dbUser.profileImage || ""
      });
    }
  }, [dbUser]);

  // Use a different state for real-time image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    setPreviewImage(profileForm.profileImage || null);
  }, [profileForm.profileImage]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-purple-600" />
      </div>
    );
  }

  if (!dbUser) {
    navigate("/");
    return null;
  }

  const handleSaveProfile = async () => {
    setIsSaving(true);
    // Optimistic UI update
    setOptimisticProfile(profileForm);

    try {
      const token = await getAuthToken();
      const response = await fetch('/api/profile', {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(profileForm)
      });

      if (!response.ok) {
        throw new Error("Failed to update profile.");
      }

      const { user: updatedUser } = await response.json();
      setDbUser(updatedUser); // Update the global auth state
      toast({
        title: "Profile Updated",
        description: "Your profile has been updated successfully.",
      });
      setIsEditing(false);
    } catch (error) {
      setOptimisticProfile(dbUser); // Rollback on error
      toast({
        title: "Error",
        description: "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelEdit = () => {
    setProfileForm({
      name: dbUser.name || "",
      bio: dbUser.bio || "",
      profileImage: dbUser.profileImage || ""
    });
    setPreviewImage(dbUser.profileImage || null);
    setIsEditing(false);
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Instant preview
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === "string") {
        setPreviewImage(e.target.result);
        setProfileForm(prev => ({ ...prev, profileImage: e.target?.result as string }));
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      <Header />
      <main className="pt-24 max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <h1 className="text-3xl sm:text-4xl font-bold text-purple-700 mb-1">Profile</h1>
        <p className="text-gray-500 mb-6 sm:mb-8 text-sm sm:text-base">Manage your account and view your progress.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-8">
          {/* Left: Personal Info */}
          <div className="md:col-span-2 space-y-4 sm:space-y-6">
            <Card className="shadow-lg rounded-2xl">
              <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between pb-2 gap-2 sm:gap-0">
                <div className="flex items-center space-x-2">
                  <User className="text-purple-500" />
                  <span className="font-semibold text-lg">Personal Information</span>
                </div>
                {!isEditing ? (
                  <Button
                    variant="ghost"
                    className="text-purple-500 hover:bg-purple-50 text-sm sm:text-base"
                    onClick={() => setIsEditing(true)}
                  >
                    <Edit className="h-4 w-4 mr-1" /> Edit
                  </Button>
                ) : (
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleCancelEdit} disabled={isSaving} className="text-sm sm:text-base">Cancel</Button>
                    <Button onClick={handleSaveProfile} disabled={isSaving} className="text-sm sm:text-base">
                      {isSaving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex flex-col md:flex-row items-center md:items-start md:space-x-6">
                <div className="flex flex-col items-center mb-4 md:mb-0">
                  <div className="relative w-20 h-20 mb-2">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white text-3xl font-bold">
                      {previewImage ? (
                        <img src={previewImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                      ) : (
                        (isEditing ? profileForm.name : optimisticProfile.name)?.charAt(0).toUpperCase() || 'U'
                      )}
                    </div>
                    {isEditing && (
                      <button
                        className="absolute bottom-0 right-0 bg-white border border-gray-300 rounded-full p-1 shadow hover:bg-gray-100"
                        onClick={() => fileInputRef.current?.click()}
                        title="Change photo"
                        disabled={isSaving}
                      >
                        <Camera className="h-5 w-5 text-purple-600" />
                      </button>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleImageUpload}
                    />
                  </div>
                  <Badge variant="default" className="mb-2">Email Account</Badge>
                </div>
                <div className="flex-1 w-full mt-2 md:mt-0">
                  {!isEditing ? (
                    <>
                      <div className="font-bold text-lg sm:text-xl mb-1">{optimisticProfile.name}</div>
                      <div className="text-gray-500 flex items-center mb-1 text-sm sm:text-base">
                        <Mail className="h-4 w-4 mr-1" /> {dbUser.email}
                      </div>
                      <div className="bg-gray-50 rounded p-2 mt-2">
                        <div className="text-xs text-gray-400">Bio</div>
                        <div className="text-gray-700 text-sm sm:text-base">{optimisticProfile.bio || 'Not set'}</div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="mb-2">
                        <Label htmlFor="editName">Full Name</Label>
                        <Input
                          id="editName"
                          value={profileForm.name}
                          onChange={e => setProfileForm({ ...profileForm, name: e.target.value })}
                          className="mt-1 text-sm sm:text-base"
                          disabled={isSaving}
                        />
                      </div>
                      <div className="mb-2">
                        <Label htmlFor="editBio">Bio</Label>
                        <Textarea
                          id="editBio"
                          value={profileForm.bio}
                          onChange={e => setProfileForm({ ...profileForm, bio: e.target.value })}
                          className="mt-1 text-sm sm:text-base"
                          rows={3}
                          disabled={isSaving}
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>

            <ProfileStats interviews={typedInterviews} />
          </div>

          {/* Right: Account Status, Quick Actions, Recent Activity */}
          <div className="space-y-4 sm:space-y-6">
            <Card className="shadow-lg rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center text-purple-600 text-base sm:text-lg">
                  <Shield className="h-5 w-5 mr-2" /> Account Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <span>Email Verified</span>
                  {dbUser.emailVerified ? (
                    <Badge variant="default">Verified</Badge>
                  ) : (
                    <Badge variant="destructive">Not Verified</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between text-sm sm:text-base">
                  <span>Member Since</span>
                  <span>{dbUser.createdAt ? new Date(dbUser.createdAt).toLocaleDateString() : "-"}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg rounded-2xl">
              <CardHeader>
                <CardTitle className="flex items-center text-purple-600 text-base sm:text-lg">
                  Quick Actions
                  {isFetching && <RefreshCcw className="h-4 w-4 ml-2 animate-spin text-gray-400" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button className="w-full bg-gradient-to-r from-purple-500 to-blue-500 text-white font-semibold text-sm sm:text-base" onClick={() => navigate('/dashboard')}>
                  <BarChart3 className="h-4 w-4 mr-2" /> View Dashboard
                </Button>
                <Button variant="outline" className="w-full text-sm sm:text-base" onClick={() => navigate('/')}>Back to Home</Button>
                <Separator />
                <Button variant="outline" className="w-full text-sm sm:text-base" onClick={() => refetch()} disabled={isFetching}>
                  <RefreshCcw className="h-4 w-4 mr-2" /> Refresh Data
                </Button>
              </CardContent>
            </Card>
            <RecentActivity interviews={typedInterviews} />
          </div>
        </div>
      </main>
    </div>
  );
}