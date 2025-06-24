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
    let unsubscribe: (() => void) | undefined;

    // Check for persistent demo mode
    const savedUser = localStorage.getItem('demo-user');
    if (savedUser) {
      const userData = JSON.parse(savedUser);
      setUser(userData.user);
      setDbUser(userData.dbUser);
      setLoading(false);
      return;
    }

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
        const demoDbUser = { id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' };
        
        setUser(demoUser);
        setDbUser(demoDbUser);
        setLoading(false);
        
        // Persist demo user
        localStorage.setItem('demo-user', JSON.stringify({ user: demoUser, dbUser: demoDbUser }));
        return;
      }

      unsubscribe = onAuthChange(async (firebaseUser) => {
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
            
            if (response.ok) {
              const userData = await response.json();
              setDbUser(userData.user);
              // Persist authenticated user
              localStorage.setItem('demo-user', JSON.stringify({ user: firebaseUser, dbUser: userData.user }));
            } else {
              setDbUser(null);
              localStorage.removeItem('demo-user');
            }
          } catch (error) {
            console.error('Error verifying user:', error);
            setDbUser(null);
            localStorage.removeItem('demo-user');
          }
        } else {
          setDbUser(null);
          localStorage.removeItem('demo-user');
        }
        
        setLoading(false);
      });
    }).catch(error => {
      console.error('Failed to initialize Firebase:', error);
      // Fallback to demo mode
      const demoUser = {
        uid: 'demo-user-123',
        email: 'demo@example.com',
        displayName: 'Demo User'
      } as User;
      const demoDbUser = { id: 1, email: 'demo@example.com', name: 'Demo User', firebaseUid: 'demo-user-123' };
      
      setUser(demoUser);
      setDbUser(demoDbUser);
      setLoading(false);
      
      // Persist demo user
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
