import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  username?: string;
  email: string;
  alert_email?: string;
  alert_webhook_url?: string;
  role: 'user' | 'admin';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('ds_token');
      const savedUser = localStorage.getItem('ds_user');
      if (savedToken && savedUser) {
        const parsedUser = JSON.parse(savedUser) as User;
        if (parsedUser?.email && parsedUser?.role) {
          setToken(savedToken);
          setUser(parsedUser);
        } else {
          localStorage.removeItem('ds_token');
          localStorage.removeItem('ds_user');
        }
      }
    } catch (error) {
      console.error('[Auth] Failed to restore saved session:', error);
      localStorage.removeItem('ds_token');
      localStorage.removeItem('ds_user');
    }
    setLoading(false);
  }, []);

  const login = (newToken: string, newUser: User) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('ds_token', newToken);
    localStorage.setItem('ds_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('ds_token');
    localStorage.removeItem('ds_user');
  };

  return (
    <AuthContext.Provider value={{ user, token, login, logout, loading }}>
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
