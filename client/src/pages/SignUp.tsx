import { useState } from "react";
import { Brain } from "lucide-react";
import { signUpWithEmail, signInWithEmail, signInWithGoogle } from "../lib/auth";
import { updateProfile } from "firebase/auth";
import { apiRequest } from "../lib/queryClient";
import { useToast } from "../hooks/use-toast";
import { useNavigate } from "react-router-dom";
import Header from "../components/Header";

export default function SignUp() {
  const [isSignUp, setIsSignUp] = useState(true);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const navigate = useNavigate();
  const getPasswordStrength = (pwd: string) => {
    if (pwd.length === 0) return "";
    if (pwd.length < 6) return "Too short";
    if (!/[A-Z]/.test(pwd)) return "Add an uppercase letter";
    if (!/[0-9]/.test(pwd)) return "Add a number";
    if (!/[^A-Za-z0-9]/.test(pwd)) return "Add a special character";
    return "Strong password";
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
    if (e.target.name === "password") setPassword(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        // Sign Up logic
        const userCred = await signUpWithEmail(form.email, form.password);
        await updateProfile(userCred.user, {
          displayName: `${form.firstName} ${form.lastName}`.trim(),
        });
        try {
          await apiRequest("POST", "/api/users", {
            email: form.email,
            name: `${form.firstName} ${form.lastName}`.trim(),
            firebaseUid: userCred.user.uid,
          });
        } catch (err) {}
        toast({
          title: "Account created!",
          description: "Welcome to AI Interviewer. You can now start practicing.",
        });
        navigate("/dashboard");
      } else {
        // Sign In logic
        await signInWithEmail(form.email, form.password);
        toast({
          title: "Welcome back!",
          description: "You have successfully signed in.",
        });
        navigate("/dashboard");
      }
    } catch (error: any) {
      toast({
        title: isSignUp ? "Sign Up Error" : "Sign In Error",
        description: error.message || `An error occurred during ${isSignUp ? "sign up" : "sign in"}.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    try {
      await signInWithGoogle();
      toast({
        title: isSignUp ? "Google Sign Up" : "Google Sign In",
        description: "Redirecting to Google for authentication...",
      });
      navigate("/dashboard");
    } catch (error: any) {
      toast({
        title: isSignUp ? "Google Sign Up Error" : "Google Sign In Error",
        description: error.message || `An error occurred during Google ${isSignUp ? "sign up" : "sign in"}.`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      <div className="pt-16 flex flex-col items-center justify-center min-h-screen px-2 sm:px-6 lg:px-8">
        {loading ? (
          <div className="text-center w-full max-w-md sm:max-w-lg md:max-w-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-gray-600 text-base sm:text-lg">Loading sign up...</p>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
            <div className="flex items-center justify-center mb-6">
              <Brain className="h-8 w-8 text-primary mr-2" />
              <h2 className="text-2xl font-bold text-gray-800">AI Interviewer</h2>
            </div>
            <h3 className="text-xl font-semibold mb-4 text-center">
              {isSignUp ? "Create an account" : "Sign in to your account"}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              {isSignUp && (
                <div className="flex space-x-2">
                  <input
                    type="text"
                    name="firstName"
                    placeholder="First Name"
                    value={form.firstName}
                    onChange={handleChange}
                    className="w-1/2 px-3 py-2 border rounded"
                    required
                  />
                  <input
                    type="text"
                    name="lastName"
                    placeholder="Last Name"
                    value={form.lastName}
                    onChange={handleChange}
                    className="w-1/2 px-3 py-2 border rounded"
                    required
                  />
                </div>
              )}
              <input
                type="email"
                name="email"
                placeholder="Email"
                value={form.email}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded"
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Password"
                value={form.password}
                onChange={handleChange}
                className="w-full px-3 py-2 border rounded"
                required
              />
              {isSignUp && (
                <div className="text-xs text-gray-500 mb-2">
                  Password strength: {getPasswordStrength(password)}
                </div>
              )}
              <button
                type="submit"
                className="w-full bg-primary text-white py-2 rounded hover:bg-primary-dark transition"
                disabled={loading}
              >
                {isSignUp ? "Sign Up" : "Sign In"}
              </button>
            </form>
            <button
              onClick={handleGoogleAuth}
              className="w-full mt-4 bg-red-500 text-white py-2 rounded hover:bg-red-600 transition flex items-center justify-center"
              disabled={loading}
            >
              <svg className="h-5 w-5 mr-2" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M21.805 10.023h-9.765v3.954h5.617c-.242 1.242-1.484 3.648-5.617 3.648-3.375 0-6.125-2.789-6.125-6.25s2.75-6.25 6.125-6.25c1.922 0 3.211.82 3.953 1.523l2.703-2.633c-1.711-1.57-3.914-2.523-6.656-2.523-5.523 0-10 4.477-10 10s4.477 10 10 10c5.75 0 9.547-4.031 9.547-9.719 0-.656-.07-1.156-.156-1.602z" fill="#fff"/></svg>
              {isSignUp ? "Sign Up with Google" : "Sign In with Google"}
            </button>
            <div className="mt-4 text-center">
              <button
                type="button"
                className="text-primary hover:underline text-sm"
                onClick={() => setIsSignUp(!isSignUp)}
                disabled={loading}
              >
                {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 