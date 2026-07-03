/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  Upload
} from 'lucide-react';
import { getPlayersFromDB, savePlayersToDB } from './lib/db';

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

// Generate 26 player slots. Zizo and Adel as the first two, rest are placeholders
const createDefaultPlayers = () => {
  const players = [];
  
  // Slot 1: Zizo
  players.push({
    id: 1,
    name: 'ZIZO',
    src: '/6zizo.png',
    bg: '#5c2828',
    panel: '#743535'
  });

  // Slot 2: Adel
  players.push({
    id: 2,
    name: 'ADEL',
    src: '/adel.png',
    bg: '#5c2828',
    panel: '#743535'
  });

  // Slots 3 to 28
  for (let i = 3; i <= 28; i++) {
    players.push({
      id: i,
      name: `PLAYER ${i}`,
      src: '', // empty image, prompts for upload
      bg: '#5c2828',
      panel: '#743535'
    });
  }
  return players;
};

// SVG Fractal Noise Grain Data URI for custom noise overlay
const GRAIN_DATA_URI = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'><filter id='noise'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23noise)' opacity='0.08'/></svg>";

// Client-side image compressor to prevent local storage quota overflow
const compressImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 500; // optimized size for avatar rendering
        const MAX_HEIGHT = 850;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, width, height); // Clear to ensure full transparency support
          ctx.drawImage(img, 0, 0, width, height);
          // Use image/png to keep original transparency
          const dataUrl = canvas.toDataURL('image/png');
          resolve(dataUrl);
        } else {
          resolve(event.target?.result as string);
        }
      };
      img.onerror = () => {
        reject(new Error('Failed to load image'));
      };
    };
    reader.onerror = (error) => reject(error);
  });
};

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
  // Load initial players list from localStorage / meta-backup or use default
  const [players, setPlayers] = useState(() => {
    let list = createDefaultPlayers();
    const saved = localStorage.getItem('toonhub_players_v3');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          list = parsed.map(normalizePlayerColors);
        }
      } catch (e) {
        console.error("Failed to parse saved players", e);
      }
    } else {
      const savedMeta = localStorage.getItem('toonhub_players_v3_meta');
      if (savedMeta) {
        try {
          const parsed = JSON.parse(savedMeta);
          if (Array.isArray(parsed) && parsed.length > 0) {
            list = parsed.map(normalizePlayerColors);
          }
        } catch (e) {
          console.error("Failed to parse saved meta players", e);
        }
      }
    }

    // Ensure there are at least 28 slots
    if (list.length < 28) {
      const padding = [];
      for (let i = list.length + 1; i <= 28; i++) {
        padding.push({
          id: i,
          name: `PLAYER ${i}`,
          src: '',
          bg: '#5c2828',
          panel: '#743535'
        });
      }
      list = [...list, ...padding];
    }
    return list;
  });

  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isAnimating, setIsAnimating] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const [dbLoaded, setDbLoaded] = useState<boolean>(false);
  const [selectedSection, setSelectedSection] = useState<string>('team');

  // Reset activeIndex to 0 when section changes
  useEffect(() => {
    setActiveIndex(0);
  }, [selectedSection]);

  // Touch swipe refs
  const touchStartX = useRef<number>(0);
  const touchEndX = useRef<number>(0);

  // Initialize and load from high-capacity IndexedDB on mount
  useEffect(() => {
    const loadFromDB = async () => {
      try {
        const dbPlayers = await getPlayersFromDB();
        if (dbPlayers && dbPlayers.length > 0) {
          let normalized = dbPlayers.map(normalizePlayerColors);
          if (normalized.length < 28) {
            const padding = [];
            for (let i = normalized.length + 1; i <= 28; i++) {
              padding.push({
                id: i,
                name: `PLAYER ${i}`,
                src: '',
                bg: '#5c2828',
                panel: '#743535'
              });
            }
            normalized = [...normalized, ...padding];
          }
          setPlayers(normalized);
        } else {
          // If IndexedDB is empty, migrate from localStorage if available
          const saved = localStorage.getItem('toonhub_players_v3');
          if (saved) {
            try {
              const parsed = JSON.parse(saved);
              if (parsed && parsed.length > 0) {
                const normalized = parsed.map(normalizePlayerColors);
                await savePlayersToDB(normalized);
                setPlayers(normalized);
              }
            } catch (e) {
              console.error(e);
            }
          }
        }
      } catch (err) {
        console.error("Error loading players from IndexedDB:", err);
      } finally {
        setDbLoaded(true);
      }
    };
    loadFromDB();
  }, []);

  // Sync players list to high-capacity IndexedDB and keep safe fallback in localStorage
  useEffect(() => {
    if (!dbLoaded) return; // CRITICAL: Do NOT overwrite with initial default state until loaded!

    // 1. Write to IndexedDB asynchronously (no browser size limitations)
    savePlayersToDB(players).catch((err) => {
      console.error("Failed to save to IndexedDB:", err);
    });

    // 2. Write lightweight backup to localStorage (names and colors only, no large images)
    // This retains custom styling and slots configuration without ever throwing a QuotaExceededError
    try {
      const lightweightPlayers = players.map(p => ({
        id: p.id,
        name: p.name,
        bg: p.bg,
        panel: p.panel,
        src: p.src && p.src.startsWith('/') ? p.src : '' // Keep preloaded transparent templates, strip upload base64s
      }));
      localStorage.setItem('toonhub_players_v3_meta', JSON.stringify(lightweightPlayers));
    } catch (e) {
      console.warn("Failed to save lightweight metadata backup:", e);
    }

    // 3. Try to save full data to localStorage as extra fallback, but catch QuotaExceededError 
    // so it NEVER throws unhandled exceptions and freezes/hangs the application
    try {
      localStorage.setItem('toonhub_players_v3', JSON.stringify(players));
    } catch (e) {
      console.warn("localStorage quota exceeded. Fallback to IndexedDB is active.", e);
    }
  }, [players, dbLoaded]);

  // Preload preloaded files on mount
  useEffect(() => {
    const preloads = ['/6zizo.png', '/adel.png'];
    preloads.forEach((src) => {
      const img = new Image();
      img.src = src;
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

  // Update single player data
  const handleUpdatePlayer = useCallback((id: number, updates: Partial<typeof players[0]>) => {
    setPlayers((prev) => 
      prev.map((player) => 
        player.id === id ? { ...player, ...updates } : player
      )
    );
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
            const hasImage = !!item.src;

            return (
              <div 
                key={item.id} 
                id={`figurine-item-${i}`}
                style={style}
                className="group select-none flex items-center justify-center"
              >
                {hasImage ? (
                  <img 
                    src={item.src} 
                    alt={item.name}
                    className="absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-transform duration-500 group-hover:scale-105"
                    draggable={false}
                  />
                ) : (
                  // Custom Interactive Upload Zone on Active Slide if Empty
                  <label 
                    onClick={(e) => {
                      if (role !== 'center') {
                        e.preventDefault(); // allow scrolling to it first
                        setActiveIndex(i);
                      }
                    }}
                    className={`absolute inset-x-4 bottom-4 top-4 rounded-[40px] border-3 border-dashed border-white/20 hover:border-white/50 bg-white/5 hover:bg-white/10 backdrop-blur-sm transition-all duration-300 flex flex-col items-center justify-center gap-4 cursor-pointer p-6 text-center ${role === 'center' ? 'pointer-events-auto' : 'pointer-events-none opacity-40'}`}
                  >
                    {role === 'center' && (
                      <input 
                        type="file" 
                        accept="image/*" 
                        className="hidden" 
                        onChange={async (e) => {
                          if (e.target.files && e.target.files[0]) {
                            try {
                              const base64 = await compressImage(e.target.files[0]);
                              handleUpdatePlayer(item.id, { src: base64 });
                            } catch (err) {
                              console.error(err);
                            }
                          }
                        }}
                      />
                    )}
                    <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center text-white group-hover:scale-110 transition-transform duration-300">
                      <Upload size={28} className="text-white" />
                    </div>
                    <div>
                      <p className="font-sans font-bold text-sm tracking-widest uppercase mb-1 text-white">
                        SLOT #{String(item.id).padStart(2, '0')}
                      </p>
                      <p className="text-xs text-white/70 font-sans tracking-wide">
                        انقر لرفع صورة اللاعب
                      </p>
                      <p className="text-[10px] text-white/40 font-mono mt-1">
                        Click to upload picture
                      </p>
                    </div>
                  </label>
                )}
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
            <span className="font-mono text-xs opacity-60 tracking-normal">#{slideNum}</span>
          </p>

          <p className="hidden sm:block text-xs opacity-75 leading-relaxed mb-4 font-normal">
            تصفح تشكيلة منتخب مصر واستخدم السيكشنز بالأعلى للتنقل بين المراكز واللاعبين، أو ارفع صورًا مباشرة للاعبين الفارغين.
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
