import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { 
  ShieldAlert, 
  ExternalLink, 
  Filter, 
  Download, 
  Search,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  FileText,
  Eye,
  Share2,
  Trash2,
  Flag,
  MonitorSmartphone,
  RefreshCw
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { cn, formatAppTimestamp } from '../lib/utils';
import Dropdown, { DropdownItem } from './ui/Dropdown';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { toast } from 'sonner';
import ConfirmModal from './ui/ConfirmModal';
import ThreatDetailModal from './ui/ThreatDetailModal';

export default function ThreatReports() {
  const [threats, setThreats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [selectedThreat, setSelectedThreat] = useState<any | null>(null);
  const { token } = useAuth();
  const { socket } = useSocket();

  const fetchThreats = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;

    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    try {
      const res = await fetch('/api/threats', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setThreats(data);
    } catch (err) {
      console.error(err);
      if (!silent) {
        toast.error('Failed to fetch threat reports');
      }
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    fetchThreats();
    const intervalId = window.setInterval(() => {
      fetchThreats({ silent: true });
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token]);

  useEffect(() => {
    if (socket) {
      socket.on('new_threat', () => {
        fetchThreats({ silent: true });
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
      toast.error('An error occurred while deleting the report');
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

  const handleAction = (action: string, id: number) => {
    toast.info(`${action} for report #${id} triggered`);
  };

  const filteredThreats = threats.filter(t => {
    const matchesSearch = t.platform.toLowerCase().includes(search.toLowerCase()) || 
                         t.content.toLowerCase().includes(search.toLowerCase());
    const isBrowserGuardScan = String(t.content || '').startsWith('Browser visit detected:');
    const matchesFilter =
      filter === 'all' ||
      t.severity === filter ||
      (filter === 'browser' && isBrowserGuardScan);
    return matchesSearch && matchesFilter;
  });

  const exportCSV = () => {
    const headers = ['Platform', 'Risk Score', 'Severity', 'Prediction', 'IP Address', 'Detected At'];
    const rows = filteredThreats.map(t => [
      t.platform,
      t.risk_score,
      t.severity,
      t.prediction,
      t.ip_address || 'unknown',
      formatAppTimestamp(t.detected_at)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `darkscan_report_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportPDF = () => {
    const doc = new jsPDF();
    doc.text('DarkScan AI - Threat Intelligence Report', 14, 15);
    doc.setFontSize(10);
    doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 22);

    const tableData = filteredThreats.map(t => [
      t.platform,
      t.risk_score,
      t.severity,
      t.prediction,
      t.ip_address || 'unknown',
      formatAppTimestamp(t.detected_at)
    ]);

    autoTable(doc, {
      head: [['Platform', 'Risk Score', 'Severity', 'Prediction', 'IP Address', 'Detected At']],
      body: tableData,
      startY: 30,
      theme: 'grid',
      headStyles: { fillColor: '#6366f1' }
    });

    doc.save(`darkscan_report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="p-8 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Threat Intelligence</h1>
          <p className="text-muted-foreground mt-1">Detailed analysis of detected suspicious activities</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={exportCSV}
            className="px-4 py-2 border border-border rounded-xl flex items-center gap-2 hover:bg-muted transition-all text-sm font-medium"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button 
            onClick={exportPDF}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-xl flex items-center gap-2 hover:opacity-90 transition-all text-sm font-medium shadow-lg shadow-primary/20"
          >
            <FileText className="w-4 h-4" />
            Export PDF
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card/70 px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-primary/10 p-2">
            <MonitorSmartphone className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm text-foreground">
              Browser Guard scans also appear here as normal threat records.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              If you used the extension, visited-site scans should appear automatically here. The page also refreshes itself every 15 seconds while it is open.
            </p>
          </div>
        </div>
      </div>

      <div className="p-6 bg-card border border-border rounded-2xl shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search reports..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-background border border-border rounded-xl focus:ring-2 focus:ring-primary outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            {['all', 'browser', 'HIGH', 'MEDIUM', 'LOW'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "px-4 py-2 rounded-xl text-sm font-medium transition-all",
                  filter === f ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                )}
              >
                {f === 'browser' ? 'Browser Guard' : f.charAt(0) + f.slice(1).toLowerCase()}
              </button>
            ))}
            <button
              onClick={() => fetchThreats({ silent: true })}
              disabled={refreshing}
              className="px-4 py-2 rounded-xl text-sm font-medium border border-border hover:bg-muted transition-all disabled:opacity-60 inline-flex items-center gap-2"
            >
              <RefreshCw className={cn("w-4 h-4", refreshing && "animate-spin")} />
              {refreshing ? 'Refreshing' : 'Refresh'}
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="text-left text-sm text-muted-foreground border-b border-border">
                <th className="pb-4 font-medium">Source</th>
                <th className="pb-4 font-medium">Analysis</th>
                <th className="pb-4 font-medium">Risk</th>
                <th className="pb-4 font-medium">Links Found</th>
                <th className="pb-4 font-medium">User IP</th>
                <th className="pb-4 font-medium">Timestamp</th>
                <th className="pb-4 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                Array(5).fill(0).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={7} className="py-8"><div className="h-4 bg-muted rounded w-full" /></td>
                  </tr>
                ))
              ) : filteredThreats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center text-muted-foreground">No reports matching your criteria.</td>
                </tr>
              ) : (
                filteredThreats.map((threat) => (
                  <tr key={threat.id} className="text-sm group hover:bg-muted/30 transition-colors">
                    <td className="py-4">
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-lg flex items-center justify-center",
                          threat.severity === 'HIGH' ? "bg-red-500/10 text-red-500" : "bg-blue-500/10 text-blue-500"
                        )}>
                          <ShieldAlert className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium break-all">{threat.platform}</p>
                          {String(threat.content || '').startsWith('Browser visit detected:') && (
                            <p className="mt-1 text-[11px] uppercase tracking-wider text-primary">Browser Guard Scan</p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-4 max-w-xs">
                      <p className="truncate text-muted-foreground">{threat.content}</p>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                          threat.severity === 'HIGH' ? "bg-red-500/10 text-red-500" :
                          threat.severity === 'MEDIUM' ? "bg-yellow-500/10 text-yellow-500" :
                          "bg-green-500/10 text-green-500"
                        )}>
                          {threat.severity} ({threat.risk_score})
                        </span>
                      </div>
                    </td>
                    <td className="py-4">
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <ExternalLink className="w-3 h-3" />
                        {JSON.parse(threat.links).length} items
                      </div>
                    </td>
                    <td className="py-4 text-xs font-mono text-muted-foreground">
                      {threat.ip_address || 'unknown'}
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
                        <DropdownItem onClick={() => handleAction('Share report', threat.id)} className="flex items-center gap-2">
                          <Share2 className="w-4 h-4" /> Share Report
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
                ))
              )}
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

        <div className="flex items-center justify-between pt-6 border-t border-border">
          <p className="text-sm text-muted-foreground">Showing {filteredThreats.length} of {threats.length} reports</p>
          <div className="flex gap-2">
            <button className="p-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50" disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className="p-2 border border-border rounded-lg hover:bg-muted disabled:opacity-50" disabled>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
