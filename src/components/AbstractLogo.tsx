import React from 'react';
import { LayoutDashboard } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const AbstractLogo = ({ className, iconClassName }: { className?: string, iconClassName?: string }) => (
  <div className={cn("w-16 h-16 bg-emerald-500/10 rounded-2xl flex items-center justify-center", className)}>
    <LayoutDashboard className={cn("w-8 h-8 text-emerald-500", iconClassName)} />
  </div>
);
