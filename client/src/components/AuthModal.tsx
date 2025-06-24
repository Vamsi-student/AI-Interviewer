import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Brain, X } from "lucide-react";
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function AuthModal({ open, onOpenChange }: AuthModalProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    rememberMe: false
  });
  const { toast } = useToast();

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isLogin) {
        await signInWithEmail(formData.email, formData.password);
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
      } else {
        if (formData.password !== formData.confirmPassword) {
          throw new Error("Passwords do not match");
        }
        await signUpWithEmail(formData.email, formData.password);
        toast({
          title: "Account created!",
          description: "Welcome to AI Interviewer. You can now start practicing.",
        });
      }
      onOpenChange(false);
      setFormData({
        name: "",
        email: "",
        password: "",
        confirmPassword: "",
        rememberMe: false
      });
    } catch (error: any) {
      toast({
        title: "Authentication Error",
        description: error.message || "An error occurred during authentication.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
      toast({
        title: "Redirecting...",
        description: "You will be redirected to Google for authentication.",
      });
    } catch (error: any) {
      toast({
        title: "Authentication Error",
        description: error.message || "Failed to sign in with Google.",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
      rememberMe: false
    });
  };

  const switchMode = (loginMode: boolean) => {
    setIsLogin(loginMode);
    resetForm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <Brain className="h-8 w-8 text-primary mr-2" />
            <DialogTitle className="text-2xl font-bold text-gray-900">
              AI Interviewer
            </DialogTitle>
          </div>
          <p className="text-gray-600 text-center">
            Start your journey to interview success
          </p>
        </DialogHeader>

        {/* Auth Toggle */}
        <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
          <Button
            type="button"
            variant={isLogin ? "default" : "ghost"}
            className={`flex-1 rounded-md ${isLogin ? 'bg-white shadow text-primary' : 'text-gray-600'}`}
            onClick={() => switchMode(true)}
          >
            Login
          </Button>
          <Button
            type="button"
            variant={!isLogin ? "default" : "ghost"}
            className={`flex-1 rounded-md ${!isLogin ? 'bg-white shadow text-primary' : 'text-gray-600'}`}
            onClick={() => switchMode(false)}
          >
            Sign Up
          </Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {!isLogin && (
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                name="name"
                type="text"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Enter your full name"
                required={!isLogin}
                className="mt-1"
              />
            </div>
          )}
          
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              value={formData.email}
              onChange={handleInputChange}
              placeholder="Enter your email"
              required
              className="mt-1"
            />
          </div>
          
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={formData.password}
              onChange={handleInputChange}
              placeholder="Enter your password"
              required
              className="mt-1"
            />
          </div>

          {!isLogin && (
            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                placeholder="Confirm your password"
                required={!isLogin}
                className="mt-1"
              />
            </div>
          )}

          {isLogin && (
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="rememberMe"
                  name="rememberMe"
                  checked={formData.rememberMe}
                  onCheckedChange={(checked) => 
                    setFormData(prev => ({ ...prev, rememberMe: checked as boolean }))
                  }
                />
                <Label htmlFor="rememberMe" className="text-sm text-gray-600">
                  Remember me
                </Label>
              </div>
              <Button
                type="button"
                variant="link"
                className="text-sm text-primary hover:text-primary/80 p-0"
              >
                Forgot password?
              </Button>
            </div>
          )}

          <Button
            type="submit"
            className="w-full btn-primary"
            disabled={loading}
          >
            {loading ? "Processing..." : (isLogin ? "Sign In" : "Create Account")}
          </Button>
        </form>

        {/* Social Login */}
        <div className="mt-6">
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">Or continue with</span>
            </div>
          </div>
          
          <div className="mt-6 space-y-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                const demoUser = {
                  uid: 'demo-user-123',
                  email: 'demo@example.com',
                  displayName: 'Demo User'
                };
                const demoDbUser = { id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' };
                
                localStorage.setItem('demo-user', JSON.stringify({ user: demoUser, dbUser: demoDbUser }));
                onOpenChange(false);
                window.location.reload();
              }}
              className="w-full bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-200"
            >
              <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Continue as Demo User
            </Button>
            
            <Button
              type="button"
              variant="outline"
              onClick={handleGoogleSignIn}
              className="w-full"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24">
                <path fill="#EA4335" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
