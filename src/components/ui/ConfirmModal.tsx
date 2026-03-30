import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, X } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  variant?: 'danger' | 'primary';
}

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'danger'
}: ConfirmModalProps) {
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
            className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative z-10"
          >
            <div className="flex items-start justify-between mb-4">
              <div className={cn(
                "p-3 rounded-xl",
                variant === 'danger' ? "bg-red-500/10 text-red-500" : "bg-primary/10 text-primary"
              )}>
                <AlertTriangle className="w-6 h-6" />
              </div>
              <button onClick={onClose} className="p-2 hover:bg-muted rounded-lg transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <h3 className="text-xl font-bold mb-2">{title}</h3>
            <p className="text-muted-foreground mb-6">{message}</p>

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-3 border border-border rounded-xl font-medium hover:bg-muted transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={cn(
                  "flex-1 py-3 text-white rounded-xl font-semibold hover:opacity-90 transition-all shadow-lg",
                  variant === 'danger' ? "bg-red-500 shadow-red-500/20" : "bg-primary shadow-primary/20"
                )}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
