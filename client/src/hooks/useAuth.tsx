import { createContext, useContext, useEffect, useState, useRef } from "react";
import { User } from "firebase/auth";
import { onAuthChange, getAuthToken } from "@/lib/auth";
import { apiRequest } from "@/lib/queryClient";

interface AuthContextType {
  user: User | null;
  dbUser: any | null;
  setDbUser: (user: any) => void;
  loading: boolean;
  getToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [dbUser, setDbUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const previousUserRef = useRef<User | null>(null);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    // Only use demo mode if explicitly chosen
    const savedDemo = localStorage.getItem('demo-user');
    if (savedDemo) {
      const userData = JSON.parse(savedDemo);
      setUser(userData.user);
      setDbUser(userData.dbUser);
      setLoading(false);
      return;
    }

    import('../lib/firebase').then(({ auth }) => {
      if (!auth) {
        console.warn('Firebase Auth not initialized - using demo mode');
        // Only fallback to demo user if Firebase fails to initialize
        const demoUser = {
          uid: 'demo-user-123',
          email: 'demo@example.com',
          displayName: 'Demo User'
        } as User;
        const demoDbUser = { id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' };
        setUser(demoUser);
        setDbUser(demoDbUser);
        setLoading(false);
        localStorage.setItem('demo-user', JSON.stringify({ user: demoUser, dbUser: demoDbUser }));
        return;
      }

      unsubscribe = onAuthChange(async (firebaseUser) => {
        // Check if this is a new sign-in
        const wasSignedOut = !previousUserRef.current && firebaseUser;
        
        setUser(firebaseUser);
        previousUserRef.current = firebaseUser;
        
        if (firebaseUser) {
          // Remove demo-user from localStorage if a real user logs in
          localStorage.removeItem('demo-user');
          
          // Show welcome message for new sign-ins (will be handled by components)
          if (wasSignedOut) {
            // Store a flag to show welcome message
            localStorage.setItem('show-welcome-message', 'true');
          }
          
          try {
            const token = await firebaseUser.getIdToken();
            const response = await fetch('/api/auth/verify', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
              }
            });
            if (response.ok) {
              const userData = await response.json();
              setDbUser(userData.user);
            } else {
              setDbUser(null);
            }
          } catch (error) {
            console.error('Error verifying user:', error);
            setDbUser(null);
          }
        } else {
          setDbUser(null);
        }
        setLoading(false);
      });
    }).catch(error => {
      console.error('Failed to initialize Firebase:', error);
      // Only fallback to demo user if Firebase fails to initialize
      const demoUser = {
        uid: 'demo-user-123',
        email: 'demo@example.com',
        displayName: 'Demo User'
      } as User;
      const demoDbUser = { id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' };
      setUser(demoUser);
      setDbUser(demoDbUser);
      setLoading(false);
      localStorage.setItem('demo-user', JSON.stringify({ user: demoUser, dbUser: demoDbUser }));
    });

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, []);

  const getToken = async () => {
    if (user?.uid === 'demo-user-123') {
      return 'demo-token';
    }
    return await getAuthToken();
  };

  return (
    <AuthContext.Provider value={{ user, dbUser, setDbUser, loading, getToken }}>
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
