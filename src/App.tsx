/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  ArrowRight
} from 'lucide-react';

// Preset background & panel color combinations
const COLOR_PRESETS = [
  { bg: '#F4845F', panel: '#F79B7F', name: 'Coral' },
  { bg: '#6BBF7A', panel: '#85CC92', name: 'Emerald' },
  { bg: '#E882B4', panel: '#ED9DC4', name: 'Rose' },
  { bg: '#6EB5FF', panel: '#8DC4FF', name: 'Sky Blue' },
  { bg: '#8338EC', panel: '#9E65F4', name: 'Royal Violet' },
  { bg: '#FF9F1C', panel: '#FFB752', name: 'Amber Gold' },
  { bg: '#2EC4B6', panel: '#5ED3C8', name: 'Neon Mint' },
  { bg: '#E63946', panel: '#EE6B76', name: 'Sunset Crimson' },
  { bg: '#1D3557', panel: '#345582', name: 'Midnight Blue' },
  { bg: '#EE6C4D', panel: '#F28F77', name: 'Warm Rust' },
  { bg: '#2A9D8F', panel: '#4CB5A8', name: 'Sage Teal' },
  { bg: '#5F0F40', panel: '#80265D', name: 'Dark Plum' },
];

const SECTIONS = [
  { id: 'team', nameAr: 'الفريق', nameEn: 'TEAM' },
  { id: 'matches', nameAr: 'المباريات', nameEn: 'MATCHES' }
];

// Default background used on pages that have no active player (e.g. Matches)
const DEFAULT_BG = '#5c2828';

// Helper to normalize the background colors to the requested #5c2828 default color
const normalizePlayerColors = (p: any) => {
  let bg = p.bg || '#5c2828';
  let panel = p.panel || '#743535';
  if (bg === '#9C2C2C' || bg.toLowerCase() === '#9c2c2c') {
    bg = '#5c2828';
  }
  if (panel === '#B43E3E' || panel.toLowerCase() === '#b43e3e') {
    panel = '#743535';
  }
  return {
    ...p,
    bg,
    panel
  };
};

// Fixed squad list — sourced directly from /public images.
// The player "name" shown behind the figure is always the image filename
// (without extension), so the two stay in sync automatically.
// "number" is the player's real shirt number (or role, e.g. "COACH").
// Leave a player's number as null until it's confirmed.
const SQUAD: { file: string; number: string | null }[] = [
  { file: 'AbdelMoneim', number: '6' },
  { file: 'adel', number: '20' },
  { file: 'alaa', number: '26' },
  { file: 'donga', number: '18' },
  { file: 'emam', number: '8' },
  { file: 'fathy', number: '14' },
  { file: 'fatouh', number: null },
  { file: 'haitham', number: null },
  { file: 'hamza', number: null },
  { file: 'hany', number: null },
  { file: 'hassan', number: 'COACH' },
  { file: 'hossam', number: null },
  { file: 'kareem', number: null },
  { file: 'mahdy', number: null },
  { file: 'Marmoush', number: null },
  { file: 'Marwan', number: null },
  { file: 'mohaned', number: null },
  { file: "Rabi'a", number: null },
  { file: 'saber', number: null },
  { file: 'salah', number: null },
  { file: 'sheno', number: null },
  { file: 'Shobeir', number: null },
  { file: 'tarek', number: null },
  { file: 'Trezeguet', number: null },
  { file: 'yasser', number: null },
  { file: 'Zico', number: null },
  { file: 'zizo', number: null },
];

const createDefaultPlayers = () => {
  return SQUAD.map((p, index) => ({
    id: index + 1,
    name: p.file,
    number: p.number,
    src: `/${p.file}.png`,
    bg: '#5c2828',
    panel: '#743535'
  }));
};

// SVG Fractal Noise Grain Data URI for custom noise overlay
const GRAIN_DATA_URI = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='noise'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23noise)' opacity='0.08'/></svg>";

// Dynamic helper to compute panel color on custom hex input
const getLighterColor = (hex: string, percent: number = 15): string => {
  try {
    let num = parseInt(hex.replace("#", ""), 16),
      amt = Math.round(2.55 * percent),
      R = (num >> 16) + amt,
      G = (num >> 8 & 0x00FF) + amt,
      B = (num & 0x0000FF) + amt;
    return "#" + (0x1000000 + (R < 255 ? R < 0 ? 0 : R : 255) * 0x10000 + (G < 255 ? G < 0 ? 0 : G : 255) * 0x100 + (B < 255 ? B < 0 ? 0 : B : 255)).toString(16).slice(1);
  } catch (e) {
    return hex;
  }
};

// Dynamic helper to compute responsive font size for single centered names behind the player
const getSingleWordFontSize = (word: string) => {
  return 'clamp(70px, 25vw, 360px)';
};

export default function App() {
  // Fixed squad — no uploads, no per-visitor customization, no persistence.
  // Everyone who opens the site sees the same 27 players and photos.
  const [players] = useState(() => createDefaultPlayers().map(normalizePlayerColors));

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [selectedSection, setSelectedSection] = useState<string>('team');

  // Reset activeIndex to 0 when section changes
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedSection]);

  // Touch swipe refs
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Preload every squad photo on mount so the carousel never flashes empty
  useEffect(() => {
    players.forEach((p) => {
      const img = new Image();
      img.src = p.src;
    });

    // Handle isMobile and window resizing
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Filter players by active section (سيكشنز)
  // 'team' shows the full squad carousel. 'matches' is intentionally empty for now.
  const sectionPlayers = useMemo(() => {
    if (selectedSection === 'matches') return [];
    return players;
  }, [players, selectedSection]);

  const isTeamPage = selectedSection === 'team';

  // Carousel navigation with 650ms lock for 3D physics ease
  const navigate = useCallback((direction: 'next' | 'prev') => {
    if (isAnimating) return;
    setIsAnimating(true);

    setActiveIndex((prev) => {
      const total = sectionPlayers.length;
      if (total <= 1) return 0;
      if (direction === 'next') {
        return (prev + 1) % total;
      } else {
        return (prev + total - 1) % total;
      }
    });

    setTimeout(() => {
      setIsAnimating(false);
    }, 650);
  }, [isAnimating, sectionPlayers.length]);

  // Bind key and mouse wheel listeners
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger carousel slide changes when typing in input fields
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key === 'ArrowLeft') {
        navigate('prev');
      } else if (e.key === 'ArrowRight') {
        navigate('next');
      }
    };

    const handleWheel = (e: WheelEvent) => {
      if (isAnimating) return;
      if (Math.abs(e.deltaY) < 30) return;
      
      if (e.deltaY > 0) {
        navigate('next');
      } else {
        navigate('prev');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('wheel', handleWheel, { passive: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('wheel', handleWheel);
    };
  }, [navigate, isAnimating]);

  // Mobile Touch Swiping
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.targetTouches[0].clientX;
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX;
  };

  const handleTouchEnd = () => {
    const diffX = touchStartX.current - touchEndX.current;
    if (Math.abs(diffX) > 50) {
      if (diffX > 0) {
        navigate('next');
      } else {
        navigate('prev');
      }
    }
  };

  // 3D positioning styles per role in the carousel
  const getRoleStyle = (role: 'center' | 'left' | 'right' | 'back') => {
    const transition = 'transform 650ms cubic-bezier(0.4, 0, 0.2, 1), filter 650ms cubic-bezier(0.4, 0, 0.2, 1), opacity 650ms cubic-bezier(0.4, 0, 0.2, 1), left 650ms cubic-bezier(0.4, 0, 0.2, 1)';
    const baseStyle = {
      position: 'absolute' as const,
      aspectRatio: '0.6 / 1',
      transition,
      willChange: 'transform, filter, opacity',
    };

    switch (role) {
      case 'center':
        return {
          ...baseStyle,
          left: '50%',
          bottom: isMobile ? '22%' : '0',
          height: isMobile ? '60%' : '88%',
          transform: `translateX(-50%) scale(${isMobile ? 1.25 : 1.62})`,
          filter: 'blur(0px)',
          opacity: 1,
          zIndex: 20,
        };
      case 'left':
        return {
          ...baseStyle,
          left: isMobile ? '20%' : '30%',
          bottom: isMobile ? '32%' : '12%',
          height: isMobile ? '16%' : '28%',
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
        };
      case 'right':
        return {
          ...baseStyle,
          left: isMobile ? '80%' : '70%',
          bottom: isMobile ? '32%' : '12%',
          height: isMobile ? '16%' : '28%',
          transform: 'translateX(-50%) scale(1)',
          filter: 'blur(2px)',
          opacity: 0.85,
          zIndex: 10,
        };
      case 'back':
        return {
          ...baseStyle,
          left: '50%',
          bottom: isMobile ? '32%' : '12%',
          height: isMobile ? '13%' : '20%',
          transform: 'translateX(-50%) scale(0.8)',
          filter: 'blur(6px)',
          opacity: 0,
          pointerEvents: 'none' as const,
          zIndex: 5,
        };
    }
  };

  // Get active item properties (fallback keeps things safe on the empty Matches page)
  const activeItem = sectionPlayers[activeIndex] || sectionPlayers[0] || players[0];
  const slideNum = String(activeItem.id).padStart(2, '0');
  const displayName = activeItem.name.trim().toUpperCase() || `PLAYER ${activeItem.id}`;
  // Jersey number (or role, e.g. "COACH") shown next to the player's name — not the slot order
  const jerseyLabel = activeItem.number
    ? (/^\d+$/.test(String(activeItem.number)) ? `#${activeItem.number}` : String(activeItem.number).toUpperCase())
    : '';

  const isArabic = /[\u0600-\u06FF]/.test(displayName);
  const words = displayName.trim().split(/\s+/);
  const leftWord = isArabic ? (words.length >= 2 ? words.slice(1).join(' ') : '') : words[0];
  const rightWord = isArabic ? words[0] : (words.length >= 2 ? words.slice(1).join(' ') : '');

  // Matches page has no active player yet, so it keeps a fixed neutral background
  const pageBg = isTeamPage ? activeItem.bg : DEFAULT_BG;

  return (
    <div 
      className="relative w-full overflow-hidden select-none min-h-screen"
      style={{ 
        backgroundColor: pageBg,
        transition: 'background-color 650ms cubic-bezier(0.4, 0, 0.2, 1)',
        fontFamily: 'Inter, sans-serif'
      }}
    >
      <div 
        className="relative w-full h-screen overflow-hidden"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Grain Overlay */}
        <div 
          className="absolute inset-0 pointer-events-none z-50"
          style={{
            backgroundImage: `url("${GRAIN_DATA_URI}")`,
            backgroundRepeat: 'repeat',
            backgroundSize: '200px 200px',
            opacity: 0.4,
          }}
        />

        {/* Header Section */}
        <header className="absolute top-6 left-4 right-4 sm:left-8 sm:right-8 z-[60] flex flex-col md:flex-row gap-4 items-center justify-between pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-4rem)]">
          <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6">
            <button
              onClick={() => setActiveIndex(0)}
              className="text-sm font-bold uppercase tracking-[0.2em] text-white hover:text-white/80 transition-all duration-150"
            >
              {SECTIONS.find((sec) => sec.id === selectedSection)?.nameEn || 'TEAM'}
            </button>
            
            <div className="hidden sm:block h-4 w-[1.5px] bg-white/25" />

            {/* Sections Selector ("سيكشنز") */}
            <div className="flex items-center gap-1 sm:gap-1.5 bg-white/5 border border-white/15 backdrop-blur-lg px-2.5 py-1 rounded-full overflow-x-auto max-w-[95vw] scrollbar-none shadow-md">
              {SECTIONS.map((sec) => {
                const isSelected = selectedSection === sec.id;
                return (
                  <button
                    key={sec.id}
                    onClick={() => {
                      setSelectedSection(sec.id);
                      setActiveIndex(0);
                    }}
                    className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all duration-200 flex items-center gap-1.5 whitespace-nowrap ${
                      isSelected 
                        ? 'bg-white text-black shadow-lg shadow-black/20 scale-105' 
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    }`}
                  >
                    <span>{sec.nameAr}</span>
                    <span className="text-[8.5px] opacity-60 font-mono hidden sm:inline">{sec.nameEn}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isTeamPage && (
            <div className="flex items-center gap-3">
              <div 
                className="flex items-center gap-3 text-xs text-white opacity-95 font-mono bg-white/10 px-3.5 py-1.5 border border-white/20 backdrop-blur-md rounded-full shadow-inner"
              >
                <span className="text-white/55">SLOT</span>
                <span>{slideNum} / {sectionPlayers.length}</span>
              </div>
            </div>
          )}
        </header>

        {/* Giant background text */}
        {isTeamPage && (
        <div 
          id="ghost-text"
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none select-none z-2 text-white font-display uppercase tracking-tighter"
          style={{
            top: '18%',
            fontSize: getSingleWordFontSize(displayName),
            fontWeight: 900,
            lineHeight: 0.85,
            letterSpacing: '-0.02em',
            whiteSpace: 'pre-line',
            opacity: 0.95,
            textAlign: 'center',
            width: '100%',
            maxWidth: '95vw',
            margin: '0 auto',
            direction: isArabic ? 'rtl' : 'ltr',
          }}
        >
          {displayName.includes(' ') ? displayName.replace(' ', '\n') : displayName}
        </div>
        )}

        {/* Carousel Stage */}
        {isTeamPage && (
        <div id="carousel-stage" className="absolute inset-0 z-3">
          {sectionPlayers.map((item, i) => {
            let role: 'center' | 'left' | 'right' | 'back';
            const total = sectionPlayers.length;
            if (i === activeIndex) {
              role = 'center';
            } else {
              if (i === (activeIndex + total - 1) % total) {
                role = 'left';
              } else if (i === (activeIndex + 1) % total) {
                role = 'right';
              } else {
                role = 'back';
              }
            }

            const style = getRoleStyle(role);

            return (
              <div 
                key={item.id} 
                id={`figurine-item-${i}`}
                style={style}
                className="group select-none flex items-center justify-center"
              >
                <img 
                  src={item.src} 
                  alt={item.name}
                  className="absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-transform duration-500 group-hover:scale-105"
                  draggable={false}
                />
              </div>
            );
          })}
        </div>
        )}

        {/* Bottom Details Panel & Buttons */}
        {isTeamPage && (
        <div 
          id="nav-section-left"
          className="absolute bottom-6 left-4 right-4 sm:bottom-16 sm:left-24 z-[60] max-w-sm sm:max-w-md text-white pointer-events-auto"
        >
          <p className="font-sans font-bold uppercase tracking-widest mb-1 sm:mb-2 text-base sm:text-[22px] opacity-95 flex items-baseline gap-3">
            <span>{displayName}</span>
            {jerseyLabel && (
              <span className="font-mono text-xs opacity-60 tracking-normal">{jerseyLabel}</span>
            )}
          </p>

          <p className="hidden sm:block text-xs opacity-75 leading-relaxed mb-4 font-normal">
            تصفح تشكيلة منتخب مصر واستخدم السيكشنز بالأعلى للتنقل بين المراكز واللاعبين.
          </p>

          <div className="flex items-center gap-3 sm:gap-4 flex-wrap">
            {/* Carousel Navigation Buttons */}
            <div className="flex gap-2">
              <button 
                id="prev-button"
                onClick={() => navigate('prev')}
                disabled={isAnimating}
                aria-label="Previous player"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 border-white/45 text-white backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/15 hover:border-white active:scale-95 disabled:opacity-40"
              >
                <ArrowLeft size={22} strokeWidth={2.25} />
              </button>
              <button 
                id="next-button"
                onClick={() => navigate('next')}
                disabled={isAnimating}
                aria-label="Next player"
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-full flex items-center justify-center border-2 border-white/45 text-white backdrop-blur-md transition-all duration-150 hover:scale-105 hover:bg-white/15 hover:border-white active:scale-95 disabled:opacity-40"
              >
                <ArrowRight size={22} strokeWidth={2.25} />
              </button>
            </div>
          </div>
        </div>
        )}

        {/* Bottom-right info link */}
        {isTeamPage && (
        <div 
          id="discover-link"
          className="absolute bottom-6 right-4 sm:bottom-16 sm:right-10 z-[60] text-right pointer-events-auto hidden sm:block"
        >
          <span className="text-[10px] uppercase tracking-widest text-white/60 font-mono block mb-1">
            2026 WORLD CUP
          </span>
          <div
            className="flex items-center gap-2 font-display uppercase tracking-tight text-white/90"
            style={{
              fontSize: 'clamp(18px, 3vw, 42px)',
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            <span>EGYPT SQUAD</span>
          </div>
        </div>
        )}

        {/* Footer disclaimer */}
        <div
          id="site-footer"
          className="absolute bottom-1.5 inset-x-0 z-[70] text-center pointer-events-none px-4"
        >
          <p className="text-[8.5px] sm:text-[10px] text-white/45 font-mono tracking-wide leading-snug">
            This website is unofficial and not affiliated with the Egyptian Football Association. Designed by Abdullah ElSawy +201061163091
          </p>
        </div>
      </div>
    </div>
  );
}
