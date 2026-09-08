import { useState } from 'react';

interface DisabledActionHintProps {
  reason: string;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
}

export function DisabledActionHint({ reason, children, side = 'top' }: DisabledActionHintProps) {
  const [showHint, setShowHint] = useState(false);

  const positionClasses = {
    top: 'bottom-full mb-2',
    bottom: 'top-full mt-2',
    left: 'right-full mr-2',
    right: 'left-full ml-2',
  };

  const arrowClasses = {
    top: 'top-full left-1/2 -translate-x-1/2 border-t-8 border-l-4 border-r-4 border-t-[#222] border-l-transparent border-r-transparent',
    bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-8 border-l-4 border-r-4 border-b-[#222] border-l-transparent border-r-transparent',
    left: 'left-full top-1/2 -translate-y-1/2 border-l-8 border-t-4 border-b-4 border-l-[#222] border-t-transparent border-b-transparent',
    right: 'right-full top-1/2 -translate-y-1/2 border-r-8 border-t-4 border-b-4 border-r-[#222] border-t-transparent border-b-transparent',
  };

  return (
    <div className="relative inline-block w-full">
      <div
        onMouseEnter={() => setShowHint(true)}
        onMouseLeave={() => setShowHint(false)}
        className="w-full"
      >
        {children}
      </div>

      {showHint && (
        <div
          className={`absolute ${positionClasses[side]} z-50 whitespace-nowrap rounded-md bg-[#222] px-3 py-2 text-xs font-medium text-white shadow-lg transition-opacity duration-200 pointer-events-none`}
        >
          {reason}
          <div className={`absolute w-0 h-0 ${arrowClasses[side]}`} />
        </div>
      )}
    </div>
  );
}
