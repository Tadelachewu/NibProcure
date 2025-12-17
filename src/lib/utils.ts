import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { Crown, Medal, Trophy } from "lucide-react";
import React from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}


export const getRankIcon = (rank?: number) => {
    switch (rank) {
        case 1: return React.createElement(Crown, { className: "h-5 w-5 text-amber-400" });
        case 2: return React.createElement(Trophy, { className: "h-5 w-5 text-slate-400" });
        case 3: return React.createElement(Medal, { className: "h-5 w-5 text-amber-600" });
        default: return null;
    }
}
