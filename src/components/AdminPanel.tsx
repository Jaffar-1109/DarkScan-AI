import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  UserPlus,
  Search,
  MoreHorizontal,
  Mail,
  Lock,
  X,
  Loader2,
  Trash2,
  Edit,
  UserCheck,
  Activity,
  Clock,
  ShieldAlert
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn, formatAppTimestamp } from '../lib/utils';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';

export default function AdminPanel() {
  const [users, setUsers] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'logs'>('users');
  const [showAddModal, setShowAddModal] = useState(false);
  const [deleteUserId, setDeleteUserId] = useState<number | null>(null);
  const [selectedUserActivity, setSelectedUserActivity] = useState<any | null>(null);
  const [activityLoading, setActivityLoading] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAlertEmail, setNewAlertEmail] = useState('');
  const { token } = useAuth();

  const fetchData = async () => {
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('/api/admin/logs', { headers: { Authorization: `Bearer ${token}` } })
      ]);

      if (!usersRes.ok || !logsRes.ok) {
        toast.error('Failed to fetch admin data');
        return;
      }

      setUsers(await usersRes.json());
      setLogs(await logsRes.json());
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!/[A-Z]/.test(newPassword) || !/\d/.test(newPassword) || !/[^A-Za-z0-9]/.test(newPassword)) {
      toast.error('Password must include one uppercase letter, one number, and one special character.');
      return;
    }

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          email: newEmail,
          password: newPassword,
          alert_email: newAlertEmail || newEmail
        })
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to create user');
        return;
      }

      toast.success('User created successfully');
      setShowAddModal(false);
      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewAlertEmail('');
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete user');
        return;
      }

      toast.success('User deleted successfully');
      setDeleteUserId(null);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleChangeRole = async (id: number, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';

    try {
      const res = await fetch(`/api/admin/users/${id}/role`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error || 'Failed to update role');
        return;
      }

      toast.success(`User role updated to ${newRole}`);
      fetchData();
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleAction = (action: string, email: string) => {
    toast.info(`${action} for ${email} triggered`);
  };

  const handleViewActivity = async (userId: number) => {
    setActivityLoading(true);
    setSelectedUserActivity(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}/activity`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error || 'Failed to load user activity');
        return;
      }

      setSelectedUserActivity(data);
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while loading user activity');
    } finally {
      setActivityLoading(false);
    }
  };

  return (
    <div className="space-y-8 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Center</h1>
          <p className="mt-1 text-muted-foreground">Manage users, monitor system logs, and security policies</p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90"
        >
          <UserPlus className="h-5 w-5" />
          Add User
        </button>
      </div>

      <div className="flex gap-4 border-b border-border">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            'relative px-6 py-4 font-medium transition-all',
            activeTab === 'users' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          User Management
          {activeTab === 'users' && <motion.div layoutId="admin-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            'relative px-6 py-4 font-medium transition-all',
            activeTab === 'logs' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Security Logs
          {activeTab === 'logs' && <motion.div layoutId="admin-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
      </div>

      <div className="overflow-visible rounded-2xl border border-border bg-card shadow-sm">
        {activeTab === 'users' ? (
          <div className="divide-y divide-border">
            <div className="flex items-center justify-between bg-muted/30 p-4">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="w-full rounded-xl border border-border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading admin data...</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">Role</th>
                    <th className="px-6 py-4 font-medium">Joined</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {users.map((user) => (
                    <tr key={user.id} className="text-sm transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 font-bold text-primary">
                            {user.email[0].toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium break-all">{user.email}</p>
                            <p className="text-xs text-muted-foreground">User ID: {user.username || user.id}</p>
                            <p className="text-xs text-muted-foreground break-all">Alerts: {user.alert_email || 'Not set'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                            user.role === 'admin'
                              ? 'border-purple-500/20 bg-purple-500/10 text-purple-500'
                              : 'border-blue-500/20 bg-blue-500/10 text-blue-500'
                          )}
                        >
                          {user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">
                        {formatAppTimestamp(user.created_at, { dateStyle: 'medium' })}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500" />
                          <span>Active</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewActivity(user.id)}
                            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <Activity className="h-4 w-4" />
                            View Activity
                          </button>

                          <Dropdown
                            trigger={
                              <button className="rounded-lg p-2 transition-colors hover:bg-muted">
                                <MoreHorizontal className="h-4 w-4" />
                              </button>
                            }
                          >
                            <DropdownItem onClick={() => handleAction('Edit Profile', user.email)} className="flex items-center gap-2">
                              <Edit className="h-4 w-4" /> Edit Profile
                            </DropdownItem>
                            <DropdownItem onClick={() => handleViewActivity(user.id)} className="flex items-center gap-2">
                              <Activity className="h-4 w-4" /> View Activity
                            </DropdownItem>
                            <DropdownItem onClick={() => handleChangeRole(user.id, user.role)} className="flex items-center gap-2">
                              <UserCheck className="h-4 w-4" /> Change Role
                            </DropdownItem>
                            <div className="my-1 h-px bg-border" />
                            <DropdownItem variant="danger" onClick={() => setDeleteUserId(user.id)} className="flex items-center gap-2">
                              <Trash2 className="h-4 w-4" /> Delete User
                            </DropdownItem>
                          </Dropdown>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-8 text-sm text-muted-foreground">Loading security logs...</div>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-muted-foreground">
                    <th className="px-6 py-4 font-medium">User</th>
                    <th className="px-6 py-4 font-medium">IP Address</th>
                    <th className="px-6 py-4 font-medium">Status</th>
                    <th className="px-6 py-4 font-medium">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {logs.map((log) => (
                    <tr key={log.id} className="text-sm transition-colors hover:bg-muted/30">
                      <td className="px-6 py-4 font-medium">{log.email}</td>
                      <td className="px-6 py-4 font-mono text-xs">{log.ip_address}</td>
                      <td className="px-6 py-4">
                        <span
                          className={cn(
                            'rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wider',
                            log.status === 'success' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'
                          )}
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-muted-foreground">{formatAppTimestamp(log.timestamp)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteUserId !== null}
        onClose={() => setDeleteUserId(null)}
        onConfirm={() => deleteUserId && handleDeleteUser(deleteUserId)}
        title="Delete User"
        message="Are you sure you want to delete this user? This will also delete all their associated data. This action cannot be undone."
        confirmLabel="Delete User"
      />

      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAddModal(false)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative z-10 w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Add New User</h2>
                <button onClick={() => setShowAddModal(false)} className="rounded-lg p-2 hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form onSubmit={handleAddUser} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">User ID</label>
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-3 outline-none transition-all focus:ring-2 focus:ring-primary"
                    placeholder="Optional custom user id"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-primary"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Alert Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="email"
                      value={newAlertEmail}
                      onChange={(e) => setNewAlertEmail(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-primary"
                      placeholder="alerts@example.com"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-xl border border-border bg-background py-3 pl-10 pr-4 outline-none transition-all focus:ring-2 focus:ring-primary"
                      placeholder="Enter Password"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 rounded-xl border border-border py-3 font-medium transition-all hover:bg-muted"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary py-3 font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90"
                  >
                    Create User
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectedUserActivity && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedUserActivity(null)}
              className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative z-10 w-full max-w-5xl max-h-[85vh] overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-2xl"
            >
              <div className="mb-6 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-2xl font-bold">User Activity Overview</h2>
                  <p className="mt-1 break-all text-sm text-muted-foreground">
                    {selectedUserActivity.user.email} · User ID: {selectedUserActivity.user.username || selectedUserActivity.user.id}
                  </p>
                </div>
                <button onClick={() => setSelectedUserActivity(null)} className="rounded-lg p-2 hover:bg-muted">
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Total Scans</p>
                  <p className="text-2xl font-bold">{selectedUserActivity.summary.totalScans}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Active Monitors</p>
                  <p className="text-2xl font-bold">{selectedUserActivity.summary.activeMonitors}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Total Monitors</p>
                  <p className="text-2xl font-bold">{selectedUserActivity.summary.totalMonitors}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-4">
                  <p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Last Login</p>
                  <p className="text-sm font-medium">
                    {selectedUserActivity.summary.lastLoginAt ? formatAppTimestamp(selectedUserActivity.summary.lastLoginAt) : 'Never'}
                  </p>
                </div>
              </div>

              <div className="max-h-[58vh] space-y-6 overflow-y-auto pr-2">
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Scan History</h3>
                  </div>
                  <div className="space-y-2">
                    {selectedUserActivity.scans.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No scans found for this user.</p>
                    ) : (
                      selectedUserActivity.scans.map((scan: any) => (
                        <div key={scan.id} className="rounded-xl border border-border bg-muted/30 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="break-all font-medium">{scan.platform}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {scan.severity} · {scan.prediction} · IP: {scan.ip_address || 'unknown'}
                              </p>
                            </div>
                            <p className="shrink-0 text-xs text-muted-foreground">{formatAppTimestamp(scan.detected_at)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Real-Time Monitoring History</h3>
                  </div>
                  <div className="space-y-2">
                    {selectedUserActivity.monitoringTasks.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No monitoring tasks found for this user.</p>
                    ) : (
                      selectedUserActivity.monitoringTasks.map((task: any) => (
                        <div key={task.id} className="rounded-xl border border-border bg-muted/30 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                              <p className="break-all font-medium">{task.keyword}</p>
                              <p className="mt-1 break-all text-xs text-muted-foreground">
                                {task.status.toUpperCase()} · Every {task.interval_hours} hours · Alerts to {task.alert_email || 'Not set'}
                              </p>
                            </div>
                            <p className="shrink-0 text-xs text-muted-foreground">
                              Last run: {task.last_run ? formatAppTimestamp(task.last_run) : 'Never'}
                            </p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider">Login Activity</h3>
                  </div>
                  <div className="space-y-2">
                    {selectedUserActivity.loginHistory.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No login activity found for this user.</p>
                    ) : (
                      selectedUserActivity.loginHistory.map((log: any) => (
                        <div key={log.id} className="rounded-xl border border-border bg-muted/30 p-4">
                          <div className="flex items-start justify-between gap-4">
                            <div>
                              <p className="font-medium">{log.status === 'success' ? 'Login Success' : 'Login Failed'}</p>
                              <p className="mt-1 text-xs text-muted-foreground">IP: {log.ip_address}</p>
                            </div>
                            <p className="shrink-0 text-xs text-muted-foreground">{formatAppTimestamp(log.timestamp)}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {activityLoading && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-background/70 backdrop-blur-sm">
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-4 shadow-xl">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <span className="text-sm font-medium">Loading user activity...</span>
          </div>
        </div>
      )}
    </div>
  );
}
