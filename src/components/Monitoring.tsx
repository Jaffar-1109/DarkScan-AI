import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Activity, 
  Clock, 
  Trash2, 
  Play, 
  Pause,
  Mail,
  Loader2,
  ShieldCheck,
  MoreHorizontal
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { cn, formatAppTimestamp } from '../lib/utils';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';

export default function Monitoring() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleteTaskId, setDeleteTaskId] = useState<number | null>(null);
  const [shareTaskId, setShareTaskId] = useState<number | null>(null);
  const [newKeyword, setNewKeyword] = useState('');
  const [alertEmail, setAlertEmail] = useState('');
  const [newInterval, setNewInterval] = useState('24');
  const { token, user } = useAuth();
  const { socket } = useSocket();

  const fetchTasks = async () => {
    if (!token) {
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setTasks(data);
    } catch (err) {
      console.error(err);
      toast.error('Failed to fetch monitoring tasks');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchTasks();
  }, [token]);

  useEffect(() => {
    setAlertEmail(user?.alert_email || user?.email || '');
  }, [user]);

  useEffect(() => {
    if (socket) {
      socket.on('new_threat', (threat: any) => {
        // We might want to refresh tasks or show a specific alert here
        // For now, just a general toast if it matches a keyword
        toast.info(`Monitoring Alert: New activity detected for your keywords`, {
          description: threat.platform
        });
      });

      return () => {
        socket.off('new_threat');
      };
    }
  }, [socket]);

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ 
          keyword: newKeyword, 
          alert_email: alertEmail,
          interval_hours: parseInt(newInterval) 
        })
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(
          data.initial_email_sent
            ? `Monitoring started. Initial report emailed to ${alertEmail}.`
            : 'Monitoring started. Initial scan completed, but email was not confirmed as sent.'
        );
        setShowModal(false);
        setNewKeyword('');
        setAlertEmail(user?.alert_email || user?.email || '');
        fetchTasks();
      } else {
        toast.error(data.error || 'Failed to create task');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleDeleteTask = async (id: number) => {
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Task deleted');
        fetchTasks();
      } else {
        toast.error('Failed to delete task');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'paused' : 'active';
    try {
      const res = await fetch(`/api/tasks/${id}/status`, {
        method: 'PATCH',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (res.ok) {
        toast.success(`Task ${newStatus === 'active' ? 'resumed' : 'paused'}`);
        fetchTasks();
      } else {
        toast.error('Failed to update status');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleShareReport = async (taskId: number) => {
    if (shareTaskId === taskId) return;

    setShareTaskId(taskId);
    try {
      const res = await fetch(`/api/tasks/${taskId}/share-report`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();

      if (res.ok) {
        toast.success(data.message || 'Monitoring report shared by email.');
      } else {
        toast.error(data.error || 'Failed to share the monitoring report.');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while sharing the report.');
    } finally {
      setShareTaskId(null);
    }
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Active Monitoring</h1>
          <p className="text-muted-foreground mt-1">Automated platform scanning and keyword tracking</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <Plus className="w-5 h-5" />
          New Monitor
        </button>
      </div>

      <div className="rounded-2xl border border-border bg-card/70 px-5 py-4">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Scheduled monitoring emails are sent by the server at the selected <span className="font-semibold text-foreground">8 / 12 / 24 hour</span> interval even if the user or admin is logged out.
          Keep the app server running for the schedule to continue.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {loading ? (
          Array(3).fill(0).map((_, i) => (
            <div key={i} className="h-48 bg-card border border-border rounded-2xl animate-pulse" />
          ))
        ) : tasks.length === 0 ? (
          <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted-foreground">
            <Activity className="w-12 h-12 mb-4 opacity-20" />
            <p>No active monitoring tasks found.</p>
          </div>
        ) : (
          tasks.map((task) => (
            <motion.div
              key={task.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="p-6 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all relative overflow-hidden group"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="p-3 bg-primary/10 rounded-xl">
                  <Activity className="w-6 h-6 text-primary" />
                </div>
                <Dropdown trigger={
                  <button className="p-2 hover:bg-muted rounded-lg transition-colors text-muted-foreground">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                }>
                  <DropdownItem onClick={() => handleShareReport(task.id)} className="flex items-center gap-2">
                    {shareTaskId === task.id ? (
                      <><Loader2 className="w-4 h-4 animate-spin" /> Sending Report</>
                    ) : (
                      <><Mail className="w-4 h-4" /> Share Latest Report Now</>
                    )}
                  </DropdownItem>
                  <div className="h-px bg-border my-1" />
                  <DropdownItem onClick={() => handleToggleStatus(task.id, task.status)} className="flex items-center gap-2">
                    {task.status === 'active' ? (
                      <><Pause className="w-4 h-4" /> Pause Monitor</>
                    ) : (
                      <><Play className="w-4 h-4" /> Resume Monitor</>
                    )}
                  </DropdownItem>
                  <div className="h-px bg-border my-1" />
                  <DropdownItem variant="danger" onClick={() => setDeleteTaskId(task.id)} className="flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete Monitor
                  </DropdownItem>
                </Dropdown>
              </div>
              
              <h3 className="text-xl font-bold mb-1">{task.keyword}</h3>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
                <Clock className="w-4 h-4" />
                Every {task.interval_hours} hours
              </div>
              <p className="text-xs text-muted-foreground mb-4">
                Alerts to: {task.alert_email}
              </p>

              <div className="flex items-center justify-between pt-4 border-t border-border">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      task.status === 'active' ? "bg-green-500 animate-pulse" : "bg-yellow-500"
                    )} />
                    <span className="text-xs font-medium uppercase tracking-wider">
                      {task.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Next run: {task.next_run_at ? formatAppTimestamp(task.next_run_at, { dateStyle: 'short', timeStyle: 'medium' }) : 'Pending'}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">
                  Last run: {task.last_run ? formatAppTimestamp(task.last_run, { dateStyle: 'short', timeStyle: 'medium' }) : 'Never'}
                </span>
              </div>
            </motion.div>
          ))
        )}
      </div>

      {/* Testing Resources Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
        className="bg-card border border-border rounded-2xl p-8 shadow-sm"
      >
        <div className="flex items-center gap-4 mb-8">
          <div className="p-3 bg-primary/10 rounded-xl">
            <ShieldCheck className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold">Testing Resources</h2>
            <p className="text-sm text-muted-foreground">Sample URLs to test the analysis engine and monitoring system</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-green-500">
              <div className="w-2 h-2 rounded-full bg-green-500" />
              Safe URLs (Low Risk)
            </h3>
            <div className="space-y-2">
              {[
                'https://www.google.com',
                'https://www.wikipedia.org',
                'https://github.com',
                'https://www.mozilla.org'
              ].map((url) => (
                <div key={url} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl group border border-transparent hover:border-border transition-all">
                  <code className="text-xs font-mono text-muted-foreground truncate mr-4">{url}</code>
                  <button 
                    onClick={() => {
                      setNewKeyword(url);
                      setShowModal(true);
                    }}
                    className="px-3 py-1 text-[10px] bg-primary/10 text-primary rounded-full font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100"
                  >
                    Monitor
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-semibold flex items-center gap-2 uppercase tracking-wider text-red-500">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              Malicious URLs & Domains (High Risk)
            </h3>
            <div className="space-y-2">
              {[
                'http://testsafebrowsing.appspot.com/s/malware.html',
                'http://testsafebrowsing.appspot.com/s/phishing.html',
                'http://www.eicar.org/download/eicar.com.txt',
                'http://amtso.org/check-desktop-solutions/',
                'http://malware-test.darkscan.ai',
                'http://bank-secure-login.bit.ly/login',
                'http://wallet-connect-verify.io',
                'http://dread_forum_onion_link/exploit-kit'
              ].map((url) => (
                <div key={url} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl group border border-transparent hover:border-border transition-all">
                  <code className="text-xs font-mono text-muted-foreground truncate mr-4">{url}</code>
                  <button 
                    onClick={() => {
                      setNewKeyword(url);
                      setShowModal(true);
                    }}
                    className="px-3 py-1 text-[10px] bg-primary/10 text-primary rounded-full font-bold uppercase tracking-wider hover:bg-primary hover:text-primary-foreground transition-all opacity-0 group-hover:opacity-100"
                  >
                    Monitor
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
        
        <div className="mt-8 p-4 bg-muted/20 rounded-xl border border-border/50">
          <p className="text-xs text-muted-foreground leading-relaxed italic">
            <span className="font-bold not-italic mr-1">Security Note:</span> 
            The "malicious" URLs provided are industry-standard test pages used for verifying security software. They do not contain actual harmful payloads but are designed to trigger security alerts in analysis engines.
          </p>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={deleteTaskId !== null}
        onClose={() => setDeleteTaskId(null)}
        onConfirm={() => deleteTaskId && handleDeleteTask(deleteTaskId)}
        title="Delete Monitor"
        message="Are you sure you want to delete this monitoring task? This action cannot be undone."
        confirmLabel="Delete"
      />

      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-8 relative z-10"
            >
              <h2 className="text-2xl font-bold mb-6">Create Monitor</h2>
              <form onSubmit={handleAddTask} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Keyword / Domain / Brand</label>
                  <input
                    type="text"
                    required
                    value={newKeyword}
                    onChange={(e) => setNewKeyword(e.target.value)}
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    placeholder="e.g. company-leaks.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Monitoring Interval</label>
                  <select
                    value={newInterval}
                    onChange={(e) => setNewInterval(e.target.value)}
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                  >
                    <option value="8">Every 8 hours</option>
                    <option value="12">Every 12 hours</option>
                    <option value="24">Every 24 hours</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Email Address</label>
                  <input
                    type="email"
                    required
                    value={alertEmail}
                    onChange={(e) => setAlertEmail(e.target.value)}
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                    placeholder="alerts@example.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Monitoring alerts and reports will be shared only to this email based on the selected schedule.
                  </p>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-3 border border-border rounded-xl font-medium hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20"
                  >
                    Start Monitoring
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
