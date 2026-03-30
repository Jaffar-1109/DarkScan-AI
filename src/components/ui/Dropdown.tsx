import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';

interface DropdownProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: 'left' | 'right';
  className?: string;
}

export default function Dropdown({ trigger, children, align = 'right', className }: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const close = () => setIsOpen(false);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div className={cn("relative inline-block text-left", className)} ref={dropdownRef}>
      <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
        {trigger}
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -10 }}
            transition={{ duration: 0.1 }}
            className={cn(
              "absolute z-50 mt-2 w-48 rounded-xl bg-card border border-border shadow-xl py-2",
              align === 'right' ? "right-0" : "left-0"
            )}
            onClick={(e) => {
              // Close dropdown when clicking an item, unless it's a specific element we want to keep open
              if ((e.target as HTMLElement).closest('button')) {
                setIsOpen(false);
              }
            }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DropdownItem({ 
  children, 
  onClick, 
  className,
  variant = 'default'
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  className?: string;
  variant?: 'default' | 'danger';
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-2 text-sm transition-colors",
        variant === 'default' ? "hover:bg-muted text-foreground" : "hover:bg-red-500/10 text-red-500",
        className
      )}
    >
      {children}
    </button>
  );
}
