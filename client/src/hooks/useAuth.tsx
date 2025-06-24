import { createContext, useContext, useEffect, useState } from "react";
import { User } from "firebase/auth";
import { onAuthChange, getAuthToken } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  dbUser: any | null;
  loading: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthChange(async (firebaseUser) => {
      setUser(firebaseUser);
      
      if (firebaseUser) {
        try {
          const token = await firebaseUser.getIdToken();
          const response = await apiRequest('POST', '/api/auth/verify', null);
          const userData = await response.json();
          setDbUser(userData.user);
        } catch (error) {
          console.error('Error verifying user:', error);
          setDbUser(null);
        }
      } else {
        setDbUser(null);
      }
      
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const getToken = async () => {
    return await getAuthToken();
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, loading, getToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
