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
const SQUAD: { file: string; number: string | null; displayName?: string }[] = [
  { file: 'hassan', number: 'COACH' },
  { file: 'sheno', number: '1' },
  { file: 'Shobeir', number: '23' },
  { file: 'mahdy', number: '16' },
  { file: 'alaa', number: '26' },
  { file: 'yasser', number: '2' },
  { file: "Rabi'a", number: '5' },
  { file: 'AbdelMoneim', number: '6', displayName: 'Moneim' },
  { file: 'hossam', number: '4' },
  { file: 'hany', number: '3' },
  { file: 'tarek', number: '24' },
  { file: 'fatouh', number: '13' },
  { file: 'kareem', number: '15' },
  { file: 'Marwan', number: '19' },
  { file: 'emam', number: '8' },
  { file: 'fathy', number: '14' },
  { file: 'mohaned', number: '17' },
  { file: 'saber', number: '21' },
  { file: 'donga', number: '18' },
  { file: 'adel', number: '20' },
  { file: 'haitham', number: '12' },
  { file: 'zizo', number: '25' },
  { file: 'Zico', number: '11' },
  { file: 'Trezeguet', number: '7' },
  { file: 'salah', number: '10' },
  { file: 'hamza', number: '9' },
  { file: 'Marmoush', number: '22' },
];

// Egypt's FIFA World Cup 2026 matches — Group G (finished with a squad-club
// of 1 win, 2 draws, 5 points, finishing 2nd and advancing to the Round of 32).
// Kickoff times are already localized to Africa/Cairo.
const GROUP_MATCHES: {
  id: number;
  matchday: string;
  opponent: string;
  opponentFlag: string;
  opponentCode: string;
  home: boolean;
  egyScore: number;
  oppScore: number;
  result: 'W' | 'D' | 'L';
  date: string;
  time: string;
}[] = [
  {
    id: 1,
    matchday: 'MATCHDAY 1',
    opponent: 'Belgium',
    opponentFlag: '🇧🇪',
    opponentCode: 'BEL',
    home: false,
    egyScore: 1,
    oppScore: 1,
    result: 'D',
    date: 'Mon, Jun 15',
    time: '10:00 PM',
  },
  {
    id: 2,
    matchday: 'MATCHDAY 2',
    opponent: 'New Zealand',
    opponentFlag: '🇳🇿',
    opponentCode: 'NZL',
    home: false,
    egyScore: 3,
    oppScore: 1,
    result: 'W',
    date: 'Mon, Jun 22',
    time: '4:00 AM',
  },
  {
    id: 3,
    matchday: 'MATCHDAY 3',
    opponent: 'IR Iran',
    opponentFlag: '🇮🇷',
    opponentCode: 'IRN',
    home: true,
    egyScore: 1,
    oppScore: 1,
    result: 'D',
    date: 'Sat, Jun 27',
    time: '6:00 AM',
  },
];

// The Round of 32 knockout match — live now. This is the fallback shown
// while /api/egypt-match hasn't responded yet (or when it's unavailable,
// e.g. running `vite dev` without `npm run dev:api` alongside it).
const LIVE_MATCH = {
  opponent: 'Australia',
  opponentFlag: '🇦🇺',
  opponentCode: 'AUS',
  egyScore: 1,
  oppScore: 0,
  stage: 'ROUND OF 32',
  date: 'Fri, Jul 3',
  time: '9:00 PM',
};

// Shape returned by our own /api/egypt-match endpoint (server.js), which
// proxies football-data.org so the API key never reaches the browser.
type EgyptMatchApiResponse = {
  status: string;
  stage: string | null;
  group: string | null;
  utcDate: string;
  minute: number | null;
  homeTeam: string | null;
  awayTeam: string | null;
  homeCrest: string | null;
  awayCrest: string | null;
  homeScore: number | null;
  awayScore: number | null;
} | null;

const createDefaultPlayers = () => {
  return SQUAD.map((p, index) => ({
    id: index + 1,
    name: p.displayName || p.file,
    number: p.number,
    src: `/${p.file}.webp`,
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
  const [liveMatch, setLiveMatch] = useState<EgyptMatchApiResponse>(null);
  const [liveMatchError, setLiveMatchError] = useState<boolean>(false);

  // Reset activeIndex to 0 when section changes
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedSection]);

  // Touch swipe refs
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Load the first-visible photo (and its immediate neighbors) right away,
  // then quietly preload the rest in the background so nothing competes
  // with the initial paint. Firing all 27 requests at once was the actual
  // bottleneck on first load, not just file size.
  useEffect(() => {
    if (players.length === 0) return;

    const priorityIndexes = [0, 1, players.length - 1].filter(
      (v, i, arr) => v >= 0 && v < players.length && arr.indexOf(v) === i
    );
    const priority = priorityIndexes.map((i) => players[i]);
    const rest = players.filter((_, i) => !priorityIndexes.includes(i));

    priority.forEach((p) => {
      const img = new Image();
      img.src = p.src;
    });

    // Stagger the remaining photos on requestIdleCallback (falls back to a
    // short timeout) so they load in the background without blocking or
    // competing with the visible card.
    const idle: (cb: () => void) => void =
      (window as any).requestIdleCallback || ((cb: () => void) => setTimeout(cb, 200));

    let cancelled = false;
    let i = 0;
    const loadNext = () => {
      if (cancelled || i >= rest.length) return;
      const img = new Image();
      img.src = rest[i].src;
      i += 1;
      idle(loadNext);
    };
    idle(loadNext);

    // Handle isMobile and window resizing
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  // Filter players by active section (سيكشنز)
  // 'team' shows the full squad carousel. 'matches' has its own dedicated view below.
  const sectionPlayers = useMemo(() => {
    if (selectedSection === 'matches') return [];
    return players;
  }, [players, selectedSection]);

  const isTeamPage = selectedSection === 'team';
  const isMatchesPage = selectedSection === 'matches';

  // Poll our own /api/egypt-match proxy (server.js) for live World Cup data
  // while the Matches page is open. Stops polling when the user navigates
  // away. Silently falls back to the static LIVE_MATCH placeholder on error
  // (e.g. missing API key, or running `vite dev` without `dev:api`).
  useEffect(() => {
    if (!isMatchesPage) return;

    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/egypt-match');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const data: EgyptMatchApiResponse = await res.json();
        if (!cancelled) {
          setLiveMatch(data);
          setLiveMatchError(false);
        }
      } catch (err) {
        if (!cancelled) setLiveMatchError(true);
      }
    };

    poll();
    const interval = setInterval(poll, 20_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isMatchesPage]);

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
    ? (/^\d+$/.test(String(activeItem.number)) ? String(activeItem.number) : String(activeItem.number).toUpperCase())
    : '';

  const isArabic = /[\u0600-\u06FF]/.test(displayName);
  const words = displayName.trim().split(/\s+/);
  const leftWord = isArabic ? (words.length >= 2 ? words.slice(1).join(' ') : '') : words[0];
  const rightWord = isArabic ? words[0] : (words.length >= 2 ? words.slice(1).join(' ') : '');

  // Matches page has no active player yet, so it keeps a fixed neutral background
  const pageBg = isTeamPage ? activeItem.bg : DEFAULT_BG;

  // Normalize whatever we have (live API data, or the static fallback) into
  // one shape the live-match card can render without branching everywhere.
  const isLiveStatus = (s: string | undefined) => s === 'LIVE' || s === 'IN_PLAY' || s === 'PAUSED';
  const liveDisplay = liveMatch
    ? {
        isLive: isLiveStatus(liveMatch.status),
        isFinished: liveMatch.status === 'FINISHED',
        isUpcoming: liveMatch.status === 'SCHEDULED' || liveMatch.status === 'TIMED',
        egyptIsHome: liveMatch.homeTeam === 'Egypt',
        opponent: (liveMatch.homeTeam === 'Egypt' ? liveMatch.awayTeam : liveMatch.homeTeam) || 'TBD',
        opponentCrest: liveMatch.homeTeam === 'Egypt' ? liveMatch.awayCrest : liveMatch.homeCrest,
        egyScore: (liveMatch.homeTeam === 'Egypt' ? liveMatch.homeScore : liveMatch.awayScore) ?? '–',
        oppScore: (liveMatch.homeTeam === 'Egypt' ? liveMatch.awayScore : liveMatch.homeScore) ?? '–',
        minute: liveMatch.minute,
        stage: liveMatch.stage || LIVE_MATCH.stage,
        kickoff: liveMatch.utcDate
          ? new Date(liveMatch.utcDate).toLocaleString('en-GB', {
              weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
              timeZone: 'Africa/Cairo',
            })
          : `${LIVE_MATCH.date} · ${LIVE_MATCH.time}`,
        isFallback: false,
      }
    : {
        isLive: true,
        isFinished: false,
        isUpcoming: false,
        egyptIsHome: false,
        opponent: LIVE_MATCH.opponent,
        opponentCrest: null as string | null,
        egyScore: LIVE_MATCH.egyScore,
        oppScore: LIVE_MATCH.oppScore,
        minute: null as number | null,
        stage: LIVE_MATCH.stage,
        kickoff: `${LIVE_MATCH.date} · ${LIVE_MATCH.time}`,
        isFallback: true,
      };

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
                  decoding="async"
                  fetchPriority={i === activeIndex ? 'high' : 'low'}
                />
              </div>
            );
          })}
        </div>
        )}

        {/* Matches Page */}
        {isMatchesPage && (
        <div className="absolute inset-0 z-3 overflow-y-auto pt-28 sm:pt-36 pb-16 px-4 sm:px-10">
          <div className="max-w-4xl mx-auto flex flex-col items-center gap-8 sm:gap-10">

            {/* Group summary */}
            <div className="text-center text-white">
              <span className="text-[10px] sm:text-xs uppercase tracking-[0.25em] text-white/55 font-mono">
                GROUP G · 2ND PLACE · QUALIFIED
              </span>
              <h2
                className="font-display uppercase tracking-tighter mt-1"
                style={{ fontSize: 'clamp(28px, 6vw, 56px)', fontWeight: 900, lineHeight: 0.95 }}
              >
                مباريات مصر
              </h2>
              <span className="text-xs sm:text-sm text-white/70 font-mono">1W · 2D · 0L — 5 PTS</span>
            </div>

            {/* Live knockout match */}
            <div className="w-full max-w-md rounded-2xl border border-red-400/40 bg-white/10 backdrop-blur-lg p-5 sm:p-6 text-white shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-3">
                {liveDisplay.isLive ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    LIVE {liveDisplay.minute ? `· ${liveDisplay.minute}'` : 'NOW'}
                  </span>
                ) : liveDisplay.isUpcoming ? (
                  <span className="text-[11px] font-bold tracking-widest text-white/70">UPCOMING</span>
                ) : (
                  <span className="text-[11px] font-bold tracking-widest text-white/50">FULL TIME</span>
                )}
                <span className="text-[10px] sm:text-xs font-mono text-white/55">{liveDisplay.stage}</span>
              </div>
              <div className="flex items-center justify-between text-center">
                <div className="flex-1">
                  <div className="text-3xl sm:text-4xl mb-1">🇪🇬</div>
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-wide">Egypt</div>
                </div>
                <div className="flex-1 font-mono">
                  <div className="text-2xl sm:text-3xl font-bold">{liveDisplay.egyScore} — {liveDisplay.oppScore}</div>
                </div>
                <div className="flex-1">
                  {liveDisplay.opponentCrest ? (
                    <img src={liveDisplay.opponentCrest} alt={liveDisplay.opponent} className="w-8 h-8 sm:w-10 sm:h-10 mx-auto mb-1 object-contain" />
                  ) : (
                    <div className="text-3xl sm:text-4xl mb-1">{LIVE_MATCH.opponentFlag}</div>
                  )}
                  <div className="text-xs sm:text-sm font-bold uppercase tracking-wide">{liveDisplay.opponent}</div>
                </div>
              </div>
              <div className="text-center mt-3 text-[10px] sm:text-xs text-white/50 font-mono">
                {liveDisplay.kickoff}
                {(liveDisplay.isFallback || liveMatchError) && ' · static preview'}
              </div>
            </div>

            {/* Group-stage matches */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              {GROUP_MATCHES.map((m) => (
                <div
                  key={m.id}
                  className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-lg p-4 sm:p-5 text-white flex flex-col items-center gap-2 hover:bg-white/10 transition-colors duration-200"
                >
                  <span className="text-[10px] font-mono tracking-widest text-white/50">{m.matchday}</span>

                  <div className="flex items-center gap-3 sm:gap-4 mt-1">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl">🇪🇬</span>
                      <span className="text-[10px] mt-1 font-mono text-white/60">{m.home ? 'HOME' : 'AWAY'}</span>
                    </div>
                    <div className="font-mono text-xl sm:text-2xl font-bold">
                      {m.home ? `${m.egyScore}–${m.oppScore}` : `${m.oppScore}–${m.egyScore}`}
                    </div>
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl">{m.opponentFlag}</span>
                      <span className="text-[10px] mt-1 font-mono text-white/60">{m.opponentCode}</span>
                    </div>
                  </div>

                  <span
                    className={`mt-1 text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                      m.result === 'W'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : m.result === 'D'
                        ? 'bg-white/15 text-white/80'
                        : 'bg-red-500/20 text-red-300'
                    }`}
                  >
                    {m.result === 'W' ? 'WIN' : m.result === 'D' ? 'DRAW' : 'LOSS'}
                  </span>

                  <span className="text-[10px] text-white/45 font-mono">{m.date} · {m.time}</span>
                </div>
              ))}
            </div>
          </div>
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
