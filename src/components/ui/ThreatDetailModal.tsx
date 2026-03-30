import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, ShieldAlert, Calendar, Globe, AlertTriangle, ExternalLink, Link as LinkIcon } from 'lucide-react';
import { cn, formatAppTimestamp } from '../../lib/utils';

interface ThreatDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  threat: any;
}

export default function ThreatDetailModal({ isOpen, onClose, threat }: ThreatDetailModalProps) {
  if (!threat) return null;

  const links = JSON.parse(threat.links || '[]');

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl overflow-hidden relative z-10"
          >
            <div className="p-6 border-b border-border flex justify-between items-center bg-muted/30">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "p-2 rounded-lg",
                  threat.severity === 'HIGH' ? "bg-red-500/10 text-red-500" :
                  threat.severity === 'MEDIUM' ? "bg-yellow-500/10 text-yellow-500" :
                  "bg-green-500/10 text-green-500"
                )}>
                  <ShieldAlert className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-xl font-bold">Threat Details</h2>
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
                    Report #{threat.id} • {threat.platform}
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
              {/* Summary Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-muted/30 rounded-2xl border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Risk Score</p>
                  <p className={cn(
                    "text-2xl font-bold",
                    threat.risk_score > 70 ? "text-red-500" : threat.risk_score > 40 ? "text-yellow-500" : "text-green-500"
                  )}>{threat.risk_score}/100</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-2xl border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Severity</p>
                  <p className="text-2xl font-bold">{threat.severity}</p>
                </div>
                <div className="p-4 bg-muted/30 rounded-2xl border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                  <p className="text-2xl font-bold text-primary">{threat.is_false_positive ? 'FALSE POSITIVE' : 'ACTIVE'}</p>
                </div>
              </div>

              {/* Content */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  Detected Content
                </h3>
                <div className="p-4 bg-muted/30 rounded-xl border border-border font-mono text-sm leading-relaxed whitespace-pre-wrap">
                  {threat.content}
                </div>
              </div>

              {/* Links */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold flex items-center gap-2 uppercase tracking-wider">
                  <LinkIcon className="w-4 h-4 text-primary" />
                  Associated Links ({links.length})
                </h3>
                <div className="space-y-2">
                  {links.map((link: string, idx: number) => (
                    <a 
                      key={idx} 
                      href={link} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-xl border border-transparent hover:border-primary/30 hover:bg-primary/5 transition-all group"
                    >
                      <span className="text-sm truncate mr-4">{link}</span>
                      <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    </a>
                  ))}
                </div>
              </div>

              {/* Metadata */}
              <div className="grid grid-cols-2 gap-8 pt-4 border-t border-border">
                <div className="flex items-center gap-3">
                  <Calendar className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Detected At</p>
                    <p className="text-sm font-medium">{formatAppTimestamp(threat.detected_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Globe className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Platform</p>
                    <p className="text-sm font-medium">{threat.platform}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-6 border-t border-border bg-muted/30 flex justify-end">
              <button
                onClick={onClose}
                className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-semibold hover:opacity-90 transition-all"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
