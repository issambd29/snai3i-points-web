import React from 'react';
import { Snai3iIcon } from './Snai3iIcon';

export const Logo = ({ className = 'h-8' }) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <Snai3iIcon className="w-8 h-8 shrink-0 drop-shadow-2xs" fill="#F2A807" />
      <div className="flex flex-col">
        <span className="text-[#1F1F38] font-black text-lg tracking-tight leading-none">
          snai3i
        </span>
        <span className="text-[#F2A807] font-bold text-[9px] uppercase tracking-widest leading-none mt-0.5">
          Points
        </span>
      </div>
    </div>
  );
};
