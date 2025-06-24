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
    // Import Firebase auth dynamically to handle initialization issues
    import('../lib/firebase').then(({ auth }) => {
      if (!auth) {
        console.warn('Firebase Auth not initialized - using demo mode');
        // Create a demo user for testing
        const demoUser = {
          uid: 'demo-user-123',
          email: 'demo@example.com',
          displayName: 'Demo User'
        } as User;
        setUser(demoUser);
        setDbUser({ id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' });
        setLoading(false);
        return;
      }

      const unsubscribe = onAuthChange(async (firebaseUser) => {
        setUser(firebaseUser);
        
        if (firebaseUser) {
          try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch('/api/auth/verify', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        });
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
    }).catch(error => {
      console.error('Failed to initialize Firebase:', error);
      // Fallback to demo mode
      const demoUser = {
        uid: 'demo-user-123',
        email: 'demo@example.com',
        displayName: 'Demo User'
      } as User;
      setUser(demoUser);
      setDbUser({ id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' });
      setLoading(false);
    });
  }, []);

  const getToken = async () => {
    if (user?.uid === 'demo-user-123') {
      return 'demo-token';
    }
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
