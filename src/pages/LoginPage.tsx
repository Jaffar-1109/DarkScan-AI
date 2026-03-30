import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Mail, User, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [captcha, setCaptcha] = useState({ data: '', text: '' });
  const [captchaInput, setCaptchaInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const { login } = useAuth();
  const { theme } = useTheme();

  const fetchCaptcha = async () => {
    const res = await fetch('/api/auth/captcha');
    const data = await res.json();
    setCaptcha(data);
  };

  React.useEffect(() => {
    fetchCaptcha();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (captchaInput !== captcha.text) {
      setError('Invalid CAPTCHA');
      fetchCaptcha();
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      if (isLogin) {
        login(data.token, data.user);
      } else {
        setSuccess('Registration successful! Please login.');
        setIsLogin(true);
        fetchCaptcha();
      }
    } catch (err: any) {
      setError(err.message);
      fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px] animate-pulse delay-700" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md p-8 rounded-2xl border border-border bg-card/50 backdrop-blur-xl shadow-2xl z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-2xl flex items-center justify-center mb-4 shadow-lg shadow-primary/20">
            <Shield className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">DarkScan AI</h1>
          <p className="text-muted-foreground text-sm mt-2">
            {isLogin ? 'Welcome back, secure your perimeter' : 'Create your secure account'}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Email Address</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="name@company.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Security Verification</label>
            <div className="flex gap-4 items-center">
              <div 
                className="bg-muted rounded-lg p-2 cursor-pointer hover:opacity-80 transition-opacity"
                onClick={fetchCaptcha}
                dangerouslySetInnerHTML={{ __html: captcha.data }}
              />
              <input
                type="text"
                required
                value={captchaInput}
                onChange={(e) => setCaptchaInput(e.target.value)}
                className="flex-1 px-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="Enter code"
              />
            </div>
          </div>

          <AnimatePresence mode="wait">
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-destructive text-sm bg-destructive/10 p-3 rounded-lg"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-2 text-green-500 text-sm bg-green-500/10 p-3 rounded-lg"
              >
                <CheckCircle2 className="w-4 h-4" />
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary text-primary-foreground rounded-lg font-semibold hover:opacity-90 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : (isLogin ? 'Sign In' : 'Create Account')}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => {
              setIsLogin(!isLogin);
              setError('');
              setSuccess('');
            }}
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            {isLogin ? "Don't have an account? Register" : 'Already have an account? Login'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
