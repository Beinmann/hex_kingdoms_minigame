'use client';

import type { BuildingType } from '../_lib/types';

type Props = {
  type: BuildingType;
  size?: number;
  className?: string;
};

export default function BuildingIcon({ type, size = 20, className }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
  };
  switch (type) {
    case 'townhall':
      return (
        <svg {...common}>
          <path d="M12 3l9 5v2H3V8l9-5z" />
          <path d="M5 10v9h14v-9" />
          <path d="M10 19v-5h4v5" />
        </svg>
      );
    case 'house':
      return (
        <svg {...common}>
          <path d="M4 11l8-7 8 7" />
          <path d="M6 10v10h12V10" />
          <path d="M10 20v-5h4v5" />
        </svg>
      );
    case 'farm':
      return (
        <svg {...common}>
          <path d="M12 4v17" />
          <path d="M12 8c-2-1-3.5-1-4.5 0s-1 2.5 0 3.5c2 0 3.5-1.5 4.5-3.5z" />
          <path d="M12 8c2-1 3.5-1 4.5 0s1 2.5 0 3.5c-2 0-3.5-1.5-4.5-3.5z" />
          <path d="M12 14c-2-1-3.5-1-4.5 0s-1 2.5 0 3.5c2 0 3.5-1.5 4.5-3.5z" />
          <path d="M12 14c2-1 3.5-1 4.5 0s1 2.5 0 3.5c-2 0-3.5-1.5-4.5-3.5z" />
        </svg>
      );
    case 'lumber':
      return (
        <svg {...common}>
          <path d="M12 3l-5 7h3l-4 6h4l-3 4h10l-3-4h4l-4-6h3z" />
          <path d="M11 20v2h2v-2" />
        </svg>
      );
    case 'quarry':
      return (
        <svg {...common}>
          <path d="M3 18l4-7 4 4 3-5 7 8z" />
          <circle cx="9" cy="7" r="1.4" />
        </svg>
      );
    case 'iron_mine':
      return (
        <svg {...common}>
          <path d="M2 20l6-11 4 6 3-4 7 9z" />
          <path d="M10 14l1.5 1.5" />
          <path d="M14 11l1.5 1.5" />
        </svg>
      );
    case 'barracks':
      return (
        <svg {...common}>
          <path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z" />
          <path d="M9 11l2 2 4-4" />
        </svg>
      );
    case 'watchtower':
      return (
        <svg {...common}>
          <path d="M9 3h6l-1 4h-4z" />
          <path d="M8 7h8l-1 13H9z" />
          <path d="M8 7l-1-2h10l-1 2" />
          <path d="M10 13h4" />
        </svg>
      );
  }
}
