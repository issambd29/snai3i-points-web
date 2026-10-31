import React from 'react';
import { Snai3iIcon } from './Snai3iIcon';

export const Logo = ({
  className = '',
  iconSize = 'w-8 h-8',
  showArabic = false,
  subtitle = 'Points',
}) => {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      <Snai3iIcon className={`${iconSize} shrink-0`} fill="#F2A807" />
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[#1F1F38] font-black text-lg tracking-tight leading-none">
            snai3i
          </span>
          {showArabic && (
            <span className="text-[#F2A807] font-bold text-xs leading-none">
              صنايعي
            </span>
          )}
        </div>
        {subtitle && (
          <span className="text-[#F2A807] font-extrabold text-[8.5px] uppercase tracking-widest leading-none mt-0.5">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
};

