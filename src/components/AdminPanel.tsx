import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  ShieldCheck, 
  History, 
  UserPlus, 
  Search,
  MoreHorizontal,
  Mail,
  Calendar,
  Lock,
  X,
  Loader2,
  Trash2,
  Edit,
  UserCheck
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';
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
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [adding, setAdding] = useState(false);
  const { token } = useAuth();

  const fetchData = async () => {
    try {
      const [usersRes, logsRes] = await Promise.all([
        fetch('/api/admin/users', { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch('/api/admin/logs', { headers: { 'Authorization': `Bearer ${token}` } })
      ]);
      if (usersRes.ok && logsRes.ok) {
        setUsers(await usersRes.json());
        setLogs(await logsRes.json());
      } else {
        toast.error('Failed to fetch admin data');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred while fetching data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, password: newPassword })
      });
      if (res.ok) {
        toast.success('User created successfully');
        setShowAddModal(false);
        setNewEmail('');
        setNewPassword('');
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to create user');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    } finally {
      setAdding(false);
    }
  };

  const handleDeleteUser = async (id: number) => {
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('User deleted successfully');
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to delete user');
      }
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
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ role: newRole })
      });
      if (res.ok) {
        toast.success(`User role updated to ${newRole}`);
        fetchData();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to update role');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleAction = (action: string, email: string) => {
    toast.info(`${action} for ${email} triggered`);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Control Center</h1>
          <p className="text-muted-foreground mt-1">Manage users, monitor system logs, and security policies</p>
        </div>
        <button 
          onClick={() => setShowAddModal(true)}
          className="px-6 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all flex items-center gap-2 shadow-lg shadow-primary/20"
        >
          <UserPlus className="w-5 h-5" />
          Add User
        </button>
      </div>

      <div className="flex gap-4 border-b border-border">
        <button
          onClick={() => setActiveTab('users')}
          className={cn(
            "px-6 py-4 font-medium transition-all relative",
            activeTab === 'users' ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          User Management
          {activeTab === 'users' && <motion.div layoutId="admin-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={cn(
            "px-6 py-4 font-medium transition-all relative",
            activeTab === 'logs' ? "text-primary" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Security Logs
          {activeTab === 'logs' && <motion.div layoutId="admin-tab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary" />}
        </button>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        {activeTab === 'users' ? (
          <div className="divide-y divide-border">
            <div className="p-4 bg-muted/30 flex justify-between items-center">
              <div className="relative max-w-sm w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Search users..."
                  className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>
            </div>
            <table className="w-full">
              <thead>
                <tr className="text-left text-sm text-muted-foreground">
                  <th className="px-6 py-4 font-medium">User</th>
                  <th className="px-6 py-4 font-medium">Role</th>
                  <th className="px-6 py-4 font-medium">Joined</th>
                  <th className="px-6 py-4 font-medium">Status</th>
                  <th className="px-6 py-4 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {users.map((user) => (
                  <tr key={user.id} className="text-sm hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold">
                          {user.email[0].toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium">{user.email}</p>
                          <p className="text-xs text-muted-foreground">ID: {user.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        user.role === 'admin' ? "bg-purple-500/10 text-purple-500 border border-purple-500/20" : "bg-blue-500/10 text-blue-500 border border-blue-500/20"
                      )}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(user.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                        <span>Active</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Dropdown trigger={
                        <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                          <MoreHorizontal className="w-4 h-4" />
                        </button>
                      }>
                        <DropdownItem onClick={() => handleAction('Edit Profile', user.email)} className="flex items-center gap-2">
                          <Edit className="w-4 h-4" /> Edit Profile
                        </DropdownItem>
                        <DropdownItem onClick={() => handleChangeRole(user.id, user.role)} className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4" /> Change Role
                        </DropdownItem>
                        <div className="h-px bg-border my-1" />
                        <DropdownItem variant="danger" onClick={() => setDeleteUserId(user.id)} className="flex items-center gap-2">
                          <Trash2 className="w-4 h-4" /> Delete User
                        </DropdownItem>
                      </Dropdown>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="divide-y divide-border">
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
                  <tr key={log.id} className="text-sm hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-4 font-medium">{log.email}</td>
                    <td className="px-6 py-4 font-mono text-xs">{log.ip_address}</td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                        log.status === 'success' ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                      )}>
                        {log.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {new Date(log.timestamp).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-8 relative z-10"
            >
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Add New User</h2>
                <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-muted rounded-lg">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={handleAddUser} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="user@example.com"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Temporary Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                      type="password"
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 py-3 border border-border rounded-xl font-medium hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={adding}
                    className="flex-1 py-3 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                  >
                    {adding ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create User'}
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
