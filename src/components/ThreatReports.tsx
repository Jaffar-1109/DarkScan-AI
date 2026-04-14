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

type ThreatRecord = {
  id: number;
  platform: string;
  content: string;
  risk_score: number;
  severity: 'HIGH' | 'MEDIUM' | 'LOW' | string;
  prediction: string;
  ip_address?: string | null;
  detected_at: string;
  links: string;
  is_false_positive?: boolean;
};

const createColor = (r: number, g: number, b: number): [number, number, number] => [r, g, b];

const REPORT_COLORS = {
  dark: createColor(15, 23, 42),
  accent: createColor(99, 102, 241),
  muted: createColor(71, 85, 105),
  border: createColor(226, 232, 240),
  success: createColor(22, 163, 74),
  warning: createColor(217, 119, 6),
  danger: createColor(220, 38, 38),
};

const parseThreatLinks = (links: string) => {
  try {
    const parsed = JSON.parse(links || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
      : [];
  } catch {
    return [];
  }
};

const normalizeThreatText = (value: string) => String(value || '').replace(/\s+/g, ' ').trim();

const summarizeThreatText = (value: string, maxLength = 120) => {
  const normalized = normalizeThreatText(value);
  if (!normalized) {
    return 'No analysis captured';
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3)}...`;
};

const getThreatStatusLabel = (threat: ThreatRecord) => threat.is_false_positive ? 'False Positive' : 'Active';

const getThreatOriginLabel = (threat: ThreatRecord) =>
  normalizeThreatText(threat.content).startsWith('Browser visit detected:') ? 'Browser Guard' : 'Threat Scan';

const escapeCsvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

const getSeverityCounts = (items: ThreatRecord[]) =>
  items.reduce(
    (acc, threat) => {
      const severity = String(threat.severity || '').toUpperCase();
      if (severity === 'HIGH') acc.high += 1;
      if (severity === 'MEDIUM') acc.medium += 1;
      if (severity === 'LOW') acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

const getReportFileStamp = () => new Date().toISOString().split('T')[0];

const downloadTextFile = (content: string, fileName: string, contentType: string) => {
  const blob = new Blob([content], { type: contentType });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const drawMetricCard = (
  doc: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  label: string,
  value: string,
  accent: readonly [number, number, number],
  subtitle?: string
) => {
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(...REPORT_COLORS.border);
  doc.roundedRect(x, y, width, height, 12, 12, 'FD');
  doc.setFillColor(...accent);
  doc.roundedRect(x + 14, y + 14, 6, height - 28, 4, 4, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...REPORT_COLORS.muted);
  doc.text(label.toUpperCase(), x + 30, y + 24);
  doc.setFontSize(20);
  doc.setTextColor(...REPORT_COLORS.dark);
  doc.text(value, x + 30, y + 50);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...REPORT_COLORS.muted);
    doc.text(subtitle, x + 30, y + 66);
  }
};

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
    if (!token) {
      return;
    }

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
    if (!token) {
      return;
    }

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
    const typedThreats = filteredThreats as ThreatRecord[];
    const severityCounts = getSeverityCounts(typedThreats);
    const activeCount = typedThreats.filter((threat) => !threat.is_false_positive).length;
    const falsePositiveCount = typedThreats.length - activeCount;
    const browserGuardCount = typedThreats.filter((threat) => getThreatOriginLabel(threat) === 'Browser Guard').length;
    const generatedAt = new Date().toLocaleString();

    const csvRows = [
      ['DarkScan AI Threat Intelligence Export'],
      ['Generated At', generatedAt],
      ['Applied Severity Filter', filter === 'all' ? 'All reports' : filter === 'browser' ? 'Browser Guard only' : filter],
      ['Search Keyword', search.trim() || 'None'],
      [],
      ['Executive Summary'],
      ['Metric', 'Value'],
      ['Total Exported Records', typedThreats.length],
      ['High Severity Records', severityCounts.high],
      ['Medium Severity Records', severityCounts.medium],
      ['Low Severity Records', severityCounts.low],
      ['Active Findings', activeCount],
      ['False Positives', falsePositiveCount],
      ['Browser Guard Findings', browserGuardCount],
      [],
      ['Detailed Findings'],
      [
        'Report ID',
        'Source / Platform',
        'Detection Origin',
        'Severity',
        'Risk Score',
        'Prediction',
        'Status',
        'Associated Links',
        'Links Found',
        'User IP',
        'Detected At',
        'Analysis Summary',
        'Detailed Analysis'
      ],
      ...typedThreats.map((threat) => {
        const links = parseThreatLinks(threat.links);
        return [
          threat.id,
          threat.platform,
          getThreatOriginLabel(threat),
          threat.severity,
          threat.risk_score,
          threat.prediction,
          getThreatStatusLabel(threat),
          links.join(' | ') || 'None',
          links.length,
          threat.ip_address || 'unknown',
          formatAppTimestamp(threat.detected_at),
          summarizeThreatText(threat.content, 140),
          normalizeThreatText(threat.content) || 'No analysis captured',
        ];
      }),
    ];

    const csvContent = `\ufeff${csvRows.map((row) => row.map(escapeCsvValue).join(',')).join('\n')}`;
    downloadTextFile(
      csvContent,
      `darkscan_threat_intelligence_${getReportFileStamp()}.csv`,
      'text/csv;charset=utf-8;'
    );
    toast.success('Professional CSV report exported');
  };

  const exportPDF = () => {
    const typedThreats = filteredThreats as ThreatRecord[];
    const severityCounts = getSeverityCounts(typedThreats);
    const generatedAt = new Date().toLocaleString();
    const activeCount = typedThreats.filter((threat) => !threat.is_false_positive).length;
    const browserGuardCount = typedThreats.filter((threat) => getThreatOriginLabel(threat) === 'Browser Guard').length;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;

    doc.setFillColor(...REPORT_COLORS.dark);
    doc.rect(0, 0, pageWidth, 120, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(24);
    doc.setTextColor(255, 255, 255);
    doc.text('DarkScan AI', margin, 46);
    doc.setFontSize(18);
    doc.text('Threat Intelligence Export Report', margin, 72);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Generated on ${generatedAt}`, margin, 94);
    doc.text(`Scope: ${filter === 'all' ? 'All records' : filter === 'browser' ? 'Browser Guard findings only' : `${filter} severity findings`}`, pageWidth - margin, 72, { align: 'right' });
    doc.text(`Search filter: ${search.trim() || 'None'}`, pageWidth - margin, 94, { align: 'right' });

    const cardY = 146;
    const cardWidth = (pageWidth - margin * 2 - 36) / 4;
    drawMetricCard(doc, margin, cardY, cardWidth, 82, 'Total Records', String(typedThreats.length), REPORT_COLORS.accent, 'Exported findings');
    drawMetricCard(doc, margin + cardWidth + 12, cardY, cardWidth, 82, 'High Severity', String(severityCounts.high), REPORT_COLORS.danger, 'Immediate review priority');
    drawMetricCard(doc, margin + (cardWidth + 12) * 2, cardY, cardWidth, 82, 'Active Findings', String(activeCount), REPORT_COLORS.warning, 'Not marked as false positive');
    drawMetricCard(doc, margin + (cardWidth + 12) * 3, cardY, cardWidth, 82, 'Browser Guard', String(browserGuardCount), REPORT_COLORS.success, 'Visited-site detections');

    const executiveSummary = [
      `This report contains ${typedThreats.length} exported threat record${typedThreats.length === 1 ? '' : 's'}.`,
      `${severityCounts.high} high, ${severityCounts.medium} medium, and ${severityCounts.low} low severity findings are included.`,
      `${browserGuardCount} finding${browserGuardCount === 1 ? '' : 's'} originated from Browser Guard monitoring.`,
    ].join(' ');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...REPORT_COLORS.dark);
    doc.text('Executive Summary', margin, 256);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...REPORT_COLORS.muted);
    doc.text(doc.splitTextToSize(executiveSummary, pageWidth - margin * 2), margin, 274);

    autoTable(doc, {
      startY: 316,
      theme: 'grid',
      margin: { left: margin, right: margin },
      head: [['Report Metadata', 'Value']],
      body: [
        ['Generated At', generatedAt],
        ['Severity Filter', filter === 'all' ? 'All records' : filter === 'browser' ? 'Browser Guard only' : filter],
        ['Search Query', search.trim() || 'None'],
        ['False Positive Records', String(typedThreats.length - activeCount)],
      ],
      styles: {
        fontSize: 9,
        cellPadding: 8,
        lineColor: REPORT_COLORS.border,
        lineWidth: 1,
      },
      headStyles: {
        fillColor: REPORT_COLORS.accent,
        textColor: 255,
        fontStyle: 'bold',
      },
      columnStyles: {
        0: { cellWidth: 170, fontStyle: 'bold', textColor: REPORT_COLORS.muted },
        1: { cellWidth: 'auto' },
      },
    });

    const registerStartY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 316) + 28;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(...REPORT_COLORS.dark);
    doc.text('Threat Register', margin, registerStartY);

    autoTable(doc, {
      startY: registerStartY + 12,
      theme: 'striped',
      margin: { left: margin, right: margin },
      head: [[
        'ID',
        'Source',
        'Origin',
        'Severity',
        'Risk',
        'Prediction',
        'Status',
        'Links',
        'User IP',
        'Detected At'
      ]],
      body: typedThreats.length > 0
        ? typedThreats.map((threat) => {
            const links = parseThreatLinks(threat.links);
            return [
              `#${threat.id}`,
              summarizeThreatText(threat.platform, 52),
              getThreatOriginLabel(threat),
              threat.severity,
              `${threat.risk_score}/100`,
              threat.prediction,
              getThreatStatusLabel(threat),
              String(links.length),
              threat.ip_address || 'unknown',
              formatAppTimestamp(threat.detected_at),
            ];
          })
        : [['-', 'No records found for the selected export filter', '-', '-', '-', '-', '-', '-', '-', '-']],
      styles: {
        fontSize: 8.5,
        cellPadding: 7,
        lineColor: REPORT_COLORS.border,
        lineWidth: 0.6,
        textColor: REPORT_COLORS.dark,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: REPORT_COLORS.accent,
        textColor: 255,
        fontStyle: 'bold',
        halign: 'center',
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252],
      },
      columnStyles: {
        0: { cellWidth: 36, halign: 'center' },
        1: { cellWidth: 156 },
        2: { cellWidth: 72 },
        3: { cellWidth: 58, halign: 'center' },
        4: { cellWidth: 54, halign: 'center' },
        5: { cellWidth: 76, halign: 'center' },
        6: { cellWidth: 82, halign: 'center' },
        7: { cellWidth: 44, halign: 'center' },
        8: { cellWidth: 78, halign: 'center' },
        9: { cellWidth: 110, halign: 'center' },
      },
    });

    doc.addPage();
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(18);
    doc.setTextColor(...REPORT_COLORS.dark);
    doc.text('Detailed Findings', margin, 48);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...REPORT_COLORS.muted);
    doc.text('Expanded record-by-record analysis for review, sharing, and audit use.', margin, 66);

    let detailY = 88;

    if (typedThreats.length === 0) {
      autoTable(doc, {
        startY: detailY,
        theme: 'grid',
        margin: { left: margin, right: margin },
        head: [['Finding Details', 'Value']],
        body: [['Status', 'No findings were available for the current filter and search criteria.']],
        styles: {
          fontSize: 10,
          cellPadding: 8,
          lineColor: REPORT_COLORS.border,
        },
        headStyles: {
          fillColor: REPORT_COLORS.accent,
          textColor: 255,
        },
      });
    } else {
      typedThreats.forEach((threat) => {
        const links = parseThreatLinks(threat.links);
        autoTable(doc, {
          startY: detailY,
          theme: 'grid',
          margin: { left: margin, right: margin },
          head: [[{
            content: `Threat #${threat.id} — ${threat.platform}`,
            colSpan: 2,
            styles: {
              fillColor: REPORT_COLORS.dark,
              textColor: 255,
              fontStyle: 'bold',
              fontSize: 11,
            }
          }]],
          body: [
            ['Detection Origin', getThreatOriginLabel(threat)],
            ['Severity / Risk Score', `${threat.severity} / ${threat.risk_score}/100`],
            ['Prediction / Status', `${threat.prediction} / ${getThreatStatusLabel(threat)}`],
            ['Detected At', formatAppTimestamp(threat.detected_at)],
            ['User IP', threat.ip_address || 'unknown'],
            ['Associated Links', links.length > 0 ? links.join('\n') : 'No links extracted'],
            ['Analysis Summary', summarizeThreatText(threat.content, 180)],
            ['Detailed Analysis', normalizeThreatText(threat.content) || 'No analysis captured'],
          ],
          styles: {
            fontSize: 9,
            cellPadding: 8,
            lineColor: REPORT_COLORS.border,
            lineWidth: 0.6,
            overflow: 'linebreak',
            valign: 'top',
            textColor: REPORT_COLORS.dark,
          },
          columnStyles: {
            0: {
              cellWidth: 150,
              fontStyle: 'bold',
              textColor: REPORT_COLORS.muted,
            },
            1: {
              cellWidth: 'auto',
            },
          },
        });

        detailY = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? detailY) + 16;
      });
    }

    const totalPages = doc.getNumberOfPages();
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(...REPORT_COLORS.border);
      doc.line(margin, pageHeight - 28, pageWidth - margin, pageHeight - 28);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...REPORT_COLORS.muted);
      doc.text('DarkScan AI • Threat Intelligence Export', margin, pageHeight - 12);
      doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin, pageHeight - 12, { align: 'right' });
    }

    doc.save(`darkscan_threat_intelligence_${getReportFileStamp()}.pdf`);
    toast.success('Professional PDF report exported');
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
