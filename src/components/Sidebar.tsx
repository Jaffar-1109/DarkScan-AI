import React from 'react';
import { motion } from 'motion/react';
import { 
  LayoutDashboard, 
  ShieldAlert, 
  Activity, 
  Users, 
  LogOut, 
  Settings, 
  ChevronLeft, 
  ChevronRight,
  Moon,
  Sun
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../contexts/ThemeContext';
import { cn } from '../lib/utils';

interface SidebarProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

export default function Sidebar({ activeTab, setActiveTab }: SidebarProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'monitoring', label: 'Monitoring', icon: Activity },
    { id: 'threats', label: 'Threat Reports', icon: ShieldAlert },
  ];

  if (user?.role === 'admin') {
    menuItems.push({ id: 'admin', label: 'Admin Panel', icon: Users });
  }

  return (
    <motion.aside
      initial={false}
      animate={{ width: isCollapsed ? 80 : 260 }}
      className="h-screen bg-card border-r border-border flex flex-col transition-all duration-300 relative z-20"
    >
      <div className="p-6 flex items-center gap-3">
        <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center shrink-0 shadow-lg shadow-primary/20">
          <ShieldAlert className="w-6 h-6 text-primary-foreground" />
        </div>
        {!isCollapsed && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="font-bold text-xl tracking-tight whitespace-nowrap"
          >
            DarkScan AI
          </motion.span>
        )}
      </div>

      <nav className="flex-1 px-4 space-y-2 mt-4">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all group relative",
              activeTab === item.id 
                ? "bg-primary text-primary-foreground shadow-lg shadow-primary/10" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <item.icon className="w-5 h-5 shrink-0" />
            {!isCollapsed && (
              <motion.span
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="font-medium"
              >
                {item.label}
              </motion.span>
            )}
            {activeTab === item.id && (
              <motion.div
                layoutId="active-pill"
                className="absolute left-0 w-1 h-6 bg-primary-foreground rounded-r-full"
              />
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-border space-y-2">
        <button
          onClick={toggleTheme}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          {!isCollapsed && <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-destructive hover:bg-destructive/10 transition-all"
        >
          <LogOut className="w-5 h-5" />
          {!isCollapsed && <span>Sign Out</span>}
        </button>
      </div>

      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-20 w-6 h-6 bg-card border border-border rounded-full flex items-center justify-center hover:bg-muted transition-colors shadow-sm"
      >
        {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
      </button>
    </motion.aside>
  );
}
