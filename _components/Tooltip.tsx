'use client';

import type { ReactNode } from 'react';

type Props = {
  content: ReactNode;
  children: ReactNode;
  className?: string;
};

export default function Tooltip({ content, children, className }: Props) {
  return (
    <span className={`relative inline-flex group ${className ?? ''}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1 z-30 hidden group-hover:block w-56 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] leading-relaxed text-zinc-200 shadow-lg"
      >
        {content}
      </span>
    </span>
  );
}
