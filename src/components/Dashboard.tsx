import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  TrendingUp, 
  ShieldCheck, 
  AlertTriangle, 
  Globe, 
  Search,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  MoreVertical,
  Eye,
  Trash2,
  Flag
} from 'lucide-react';
import { cn, formatAppTimestamp, parseAppTimestamp } from '../lib/utils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';
import ThreatDetailModal from './ui/ThreatDetailModal';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ArcElement
);

interface DashboardProps {
  setActiveTab: (tab: string) => void;
}

export default function Dashboard({ setActiveTab }: DashboardProps) {
  const [threats, setThreats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanUrl, setScanUrl] = useState('');
  const [scanning, setScanning] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<any | null>(null);
  const { token } = useAuth();
  const { socket } = useSocket();

  const fetchThreats = async () => {
    if (!token) {
      return;
    }

    try {
      const res = await fetch('/api/threats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setThreats(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) {
      return;
    }

    fetchThreats();
  }, [token]);

  useEffect(() => {
    if (socket) {
      socket.on('new_threat', (threat: any) => {
        setThreats(prev => [threat, ...prev]);
        toast.error(`New ${threat.severity} risk detected!`, {
          description: threat.platform,
          action: {
            label: 'View',
            onClick: () => setSelectedThreat(threat)
          }
        });
      });

      return () => {
        socket.off('new_threat');
      };
    }
  }, [socket]);

  const handleDelete = async (id: number) => {
    try {
      const res = await fetch(`/api/threats/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        toast.success('Report deleted successfully');
        fetchThreats();
      } else {
        toast.error('Failed to delete report');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleFlagFalsePositive = async (id: number, currentStatus: boolean) => {
    try {
      const res = await fetch(`/api/threats/${id}/flag`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ is_false_positive: !currentStatus })
      });
      if (res.ok) {
        toast.success(`Report ${!currentStatus ? 'flagged as false positive' : 'unflagged'}`);
        fetchThreats();
      } else {
        toast.error('Failed to update report status');
      }
    } catch (err) {
      console.error(err);
      toast.error('An error occurred');
    }
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scanUrl) return;
    setScanning(true);
    try {
      await fetch('/api/analyze', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ url: scanUrl })
      });
      setScanUrl('');
      fetchThreats();
    } catch (err) {
      console.error(err);
    } finally {
      setScanning(false);
    }
  };

  const calculateTrend = (data: any[], filterFn?: (item: any) => boolean) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const currentPeriod = data.filter(t => {
      const date = parseAppTimestamp(t.detected_at);
      if (!date) return false;
      return date > twentyFourHoursAgo && (!filterFn || filterFn(t));
    }).length;

    const previousPeriod = data.filter(t => {
      const date = parseAppTimestamp(t.detected_at);
      if (!date) return false;
      return date > fortyEightHoursAgo && date <= twentyFourHoursAgo && (!filterFn || filterFn(t));
    }).length;

    if (previousPeriod === 0) return currentPeriod > 0 ? 100 : 0;
    return Math.round(((currentPeriod - previousPeriod) / previousPeriod) * 100);
  };

  const calculateAvgTrend = (data: any[]) => {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    const currentData = data.filter(t => {
      const date = parseAppTimestamp(t.detected_at);
      return date ? date > twentyFourHoursAgo : false;
    });
    const previousData = data.filter(t => {
      const date = parseAppTimestamp(t.detected_at);
      return date ? date > fortyEightHoursAgo && date <= twentyFourHoursAgo : false;
    });

    const currentAvg = currentData.length ? currentData.reduce((a, b) => a + b.risk_score, 0) / currentData.length : 0;
    const previousAvg = previousData.length ? previousData.reduce((a, b) => a + b.risk_score, 0) / previousData.length : 0;

    if (previousAvg === 0) return currentAvg > 0 ? 100 : 0;
    return Math.round(((currentAvg - previousAvg) / previousAvg) * 100);
  };

  const stats = [
    { 
      label: 'Total Scans', 
      value: threats.length, 
      icon: Globe, 
      color: 'text-blue-500', 
      bg: 'bg-blue-500/10',
      trend: calculateTrend(threats)
    },
    { 
      label: 'High Threats', 
      value: threats.filter(t => t.severity === 'HIGH').length, 
      icon: AlertTriangle, 
      color: 'text-red-500', 
      bg: 'bg-red-500/10',
      trend: calculateTrend(threats, t => t.severity === 'HIGH')
    },
    { 
      label: 'Safe Domains', 
      value: threats.filter(t => t.prediction === 'Safe').length, 
      icon: ShieldCheck, 
      color: 'text-green-500', 
      bg: 'bg-green-500/10',
      trend: calculateTrend(threats, t => t.prediction === 'Safe')
    },
    { 
      label: 'Avg Risk Score', 
      value: threats.length ? Math.round(threats.reduce((a, b) => a + b.risk_score, 0) / threats.length) : 0, 
      icon: TrendingUp, 
      color: 'text-purple-500', 
      bg: 'bg-purple-500/10',
      trend: calculateAvgTrend(threats)
    },
  ];

  const lineData = {
    labels: threats.slice(0, 7).reverse().map(t => parseAppTimestamp(t.detected_at)?.toLocaleDateString() ?? 'Unknown'),
    datasets: [{
      label: 'Risk Score Trend',
      data: threats.slice(0, 7).reverse().map(t => t.risk_score),
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99, 102, 241, 0.1)',
      fill: true,
      tension: 0.4,
    }]
  };

  const doughnutData = {
    labels: ['High', 'Medium', 'Low'],
    datasets: [{
      data: [
        threats.filter(t => t.severity === 'HIGH').length,
        threats.filter(t => t.severity === 'MEDIUM').length,
        threats.filter(t => t.severity === 'LOW').length,
      ],
      backgroundColor: ['#ef4444', '#f59e0b', '#10b981'],
      borderWidth: 0,
    }]
  };

  const getRiskLevel = (avgScore: number) => {
    if (avgScore > 70) return { label: 'CRITICAL', color: 'text-red-500', bg: 'bg-red-500/10' };
    if (avgScore > 30) return { label: 'ELEVATED', color: 'text-yellow-500', bg: 'bg-yellow-500/10' };
    return { label: 'SECURE', color: 'text-green-500', bg: 'bg-green-500/10' };
  };

  const riskLevel = getRiskLevel(stats[3].value);

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">Security Overview</h1>
            <span className={cn(
              "px-3 py-1 rounded-full text-xs font-bold tracking-widest border",
              riskLevel.bg,
              riskLevel.color,
              riskLevel.color.replace('text-', 'border-').replace('500', '500/20')
            )}>
              {riskLevel.label}
            </span>
          </div>
          <p className="text-muted-foreground mt-1">Real-time threat intelligence and monitoring</p>
        </div>
        <div className="flex gap-4">
          <form onSubmit={handleScan} className="flex gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="url"
                placeholder="Scan URL or Domain..."
                value={scanUrl}
                onChange={(e) => setScanUrl(e.target.value)}
                className="pl-10 pr-4 py-2 bg-card border border-border rounded-xl w-64 focus:ring-2 focus:ring-primary outline-none transition-all"
              />
            </div>
            <button
              disabled={scanning}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-medium hover:opacity-90 transition-all flex items-center gap-2"
            >
              {scanning ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Quick Scan'}
            </button>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
            className="p-6 bg-card border border-border rounded-2xl shadow-sm hover:shadow-md transition-all group"
          >
            <div className="flex justify-between items-start">
              <div className={cn("p-3 rounded-xl", stat.bg)}>
                <stat.icon className={cn("w-6 h-6", stat.color)} />
              </div>
              {stat.trend !== 0 && (
                <div className={cn(
                  "flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full",
                  stat.label === 'High Threats' || stat.label === 'Avg Risk Score'
                    ? (stat.trend > 0 ? "text-red-500 bg-red-500/10" : "text-green-500 bg-green-500/10")
                    : (stat.trend > 0 ? "text-green-500 bg-green-500/10" : "text-red-500 bg-red-500/10")
                )}>
                  {stat.trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                  {Math.abs(stat.trend)}%
                </div>
              )}
            </div>
            <div className="mt-4">
              <p className="text-sm text-muted-foreground">{stat.label}</p>
              <h3 className="text-2xl font-bold mt-1">{stat.value}</h3>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Threat Activity</h3>
          <div className="h-[300px]">
            <Line 
              data={lineData} 
              options={{ 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, max: 100 } }
              }} 
            />
          </div>
        </div>
        <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
          <h3 className="text-lg font-semibold mb-6">Severity Distribution</h3>
          <div className="h-[300px] flex items-center justify-center">
            <Doughnut 
              data={doughnutData}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                cutout: '70%',
                plugins: { legend: { position: 'bottom' } }
              }}
            />
          </div>
        </div>
      </div>

      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold">Recent Detections</h3>
          <button 
            onClick={() => setActiveTab('threats')}
            className="text-sm text-primary hover:underline"
          >
            View All
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground border-b border-border">
                <th className="pb-4 font-medium">Platform/URL</th>
                <th className="pb-4 font-medium">Risk Score</th>
                <th className="pb-4 font-medium">Severity</th>
                <th className="pb-4 font-medium">Prediction</th>
                <th className="pb-4 font-medium">Detected At</th>
                <th className="pb-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {threats.slice(0, 5).map((threat) => (
                <tr key={threat.id} className="text-sm group hover:bg-muted/50 transition-colors">
                  <td className="py-4 font-medium">{threat.platform}</td>
                  <td className="py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
                        <div 
                          className={cn(
                            "h-full rounded-full transition-all",
                            threat.risk_score > 70 ? "bg-red-500" : threat.risk_score > 30 ? "bg-yellow-500" : "bg-green-500"
                          )}
                          style={{ width: `${threat.risk_score}%` }}
                        />
                      </div>
                      <span className="text-xs font-mono">{threat.risk_score}</span>
                    </div>
                  </td>
                  <td className="py-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      threat.severity === 'HIGH' ? "bg-red-500/10 text-red-500 border border-red-500/20" :
                      threat.severity === 'MEDIUM' ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                      "bg-green-500/10 text-green-500 border border-green-500/20"
                    )}>
                      {threat.severity}
                    </span>
                  </td>
                  <td className="py-4">
                    <span className={cn(
                      "font-medium",
                      threat.prediction === 'Threat' ? "text-red-500" : "text-green-500"
                    )}>
                      {threat.prediction}
                    </span>
                  </td>
                  <td className="py-4 text-muted-foreground">
                    {formatAppTimestamp(threat.detected_at)}
                  </td>
                  <td className="py-4 text-right">
                    <Dropdown trigger={
                      <button className="p-2 hover:bg-muted rounded-lg transition-colors">
                        <MoreVertical className="w-4 h-4" />
                      </button>
                    }>
                      <DropdownItem onClick={() => setSelectedThreat(threat)} className="flex items-center gap-2">
                        <Eye className="w-4 h-4" /> View Details
                      </DropdownItem>
                      <DropdownItem onClick={() => handleFlagFalsePositive(threat.id, threat.is_false_positive)} className="flex items-center gap-2">
                        <Flag className={cn("w-4 h-4", threat.is_false_positive && "text-primary fill-primary")} /> 
                        {threat.is_false_positive ? 'Unflag False Positive' : 'Flag False Positive'}
                      </DropdownItem>
                      <div className="h-px bg-border my-1" />
                      <DropdownItem variant="danger" onClick={() => setDeleteId(threat.id)} className="flex items-center gap-2">
                        <Trash2 className="w-4 h-4" /> Delete Report
                      </DropdownItem>
                    </Dropdown>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ConfirmModal
          isOpen={deleteId !== null}
          onClose={() => setDeleteId(null)}
          onConfirm={() => deleteId && handleDelete(deleteId)}
          title="Delete Report"
          message="Are you sure you want to delete this threat report? This action cannot be undone."
          confirmLabel="Delete"
        />

        <ThreatDetailModal
          isOpen={selectedThreat !== null}
          onClose={() => setSelectedThreat(null)}
          threat={selectedThreat}
        />
      </div>
    </div>
  );
}
