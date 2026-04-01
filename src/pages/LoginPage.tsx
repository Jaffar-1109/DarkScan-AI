import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Shield, Lock, Mail, User, Loader2, AlertCircle, CheckCircle2, RefreshCcw, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isStrongPassword } from '../lib/utils';

export default function LoginPage() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [captcha, setCaptcha] = useState({ data: '', text: '' });
  const [captchaInput, setCaptchaInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [emailValidation, setEmailValidation] = useState<{
    status: 'idle' | 'checking' | 'valid' | 'invalid';
    message: string;
  }>({ status: 'idle', message: '' });
  const { login } = useAuth();

  const fetchCaptcha = async () => {
    const res = await fetch('/api/auth/captcha');
    const data = await res.json();
    setCaptcha(data);
    setCaptchaInput('');
  };

  React.useEffect(() => {
    fetchCaptcha();
  }, []);

  React.useEffect(() => {
    if (isLogin) {
      setEmailValidation({ status: 'idle', message: '' });
      return;
    }

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setEmailValidation({ status: 'idle', message: '' });
      return;
    }

    const formatLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
    if (!formatLooksValid) {
      setEmailValidation({ status: 'invalid', message: 'Invalid email format.' });
      return;
    }

    let cancelled = false;
    setEmailValidation({ status: 'checking', message: 'Checking email domain...' });

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch('/api/auth/validate-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: trimmedEmail }),
        });
        const data = await res.json();
        if (cancelled) return;

        if (data.valid) {
          setEmailValidation({ status: 'valid', message: 'Email domain verified.' });
        } else {
          setEmailValidation({ status: 'invalid', message: data.error || 'This email address could not be verified.' });
        }
      } catch {
        if (!cancelled) {
          setEmailValidation({ status: 'invalid', message: 'Unable to verify email right now.' });
        }
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [email, isLogin]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (captchaInput !== captcha.text) {
      setError('Invalid CAPTCHA');
      fetchCaptcha();
      return;
    }

    if (!isLogin && !isStrongPassword(password)) {
      setError('Password must include one uppercase letter, one number, and one special character.');
      fetchCaptcha();
      return;
    }

    if (!isLogin && password !== confirmPassword) {
      setError('Passwords do not match.');
      fetchCaptcha();
      return;
    }

    if (!isLogin && emailValidation.status === 'invalid') {
      setError(emailValidation.message || 'Please enter a valid email address.');
      fetchCaptcha();
      return;
    }

    setLoading(true);
    try {
      const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
      const payload = isLogin
        ? { identifier: email, password }
        : { email, username, password };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Something went wrong');

      if (isLogin) {
        login(data.token, data.user);
      } else {
        setSuccess(`Registration successful! Your user id is ${data.username}. Please login.`);
        setIsLogin(true);
        setUsername('');
        setPassword('');
        setConfirmPassword('');
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
            <label className="text-sm font-medium">{isLogin ? 'Email or User ID' : 'Email Address'}</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={isLogin ? 'text' : 'email'}
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder={isLogin ? 'name@company.com or Admin_DarkScan.AI' : 'name@company.com'}
              />
            </div>
            {!isLogin && (
              <p className={
                emailValidation.status === 'invalid'
                  ? 'text-xs text-destructive'
                  : emailValidation.status === 'valid'
                    ? 'text-xs text-green-500'
                    : 'text-xs text-muted-foreground'
              }>
                {emailValidation.message || 'Use a real email address with a valid mail domain so alerts and verification reports can be delivered.'}
              </p>
            )}
          </div>

          {!isLogin && (
            <div className="space-y-2">
              <label className="text-sm font-medium">User ID</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Optional custom user id"
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-12 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                placeholder="Enter Password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {!isLogin && (
              <p className="text-xs text-muted-foreground">
                Password must include one uppercase letter, one number, and one special character.
              </p>
            )}
          </div>

          {!isLogin && (
            <div className="space-y-2">
              <label className="text-sm font-medium">Confirm Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-12 py-2 bg-background border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Confirm Password"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  aria-label={showConfirmPassword ? 'Hide password confirmation' : 'Show password confirmation'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPassword && password !== confirmPassword && (
                <p className="text-xs text-destructive">Passwords do not match.</p>
              )}
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium">Security Verification</label>
            <div className="rounded-xl border border-border bg-background/60 p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div 
                  className="bg-muted rounded-lg p-2 cursor-pointer hover:opacity-80 transition-opacity w-fit"
                  onClick={fetchCaptcha}
                  dangerouslySetInnerHTML={{ __html: captcha.data }}
                />
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  className="h-11 w-11 border border-border rounded-lg hover:bg-muted transition-colors shrink-0 flex items-center justify-center"
                  aria-label="Refresh CAPTCHA"
                >
                  <RefreshCcw className="w-4 h-4" />
                </button>
                <input
                  type="text"
                  required
                  value={captchaInput}
                  onChange={(e) => setCaptchaInput(e.target.value)}
                  className="min-w-0 flex-1 h-11 px-4 bg-card border border-border rounded-lg focus:ring-2 focus:ring-primary outline-none transition-all"
                  placeholder="Enter code"
                />
              </div>
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
              setUsername('');
              setPassword('');
              setConfirmPassword('');
              setShowPassword(false);
              setShowConfirmPassword(false);
              fetchCaptcha();
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
