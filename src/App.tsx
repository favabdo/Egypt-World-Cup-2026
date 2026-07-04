/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  ArrowRight,
  X,
  Clock,
  Footprints,
  Target,
  Handshake,
  Sparkles,
  Shield,
  Languages,
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
  isoDate: string;
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
    isoDate: '2026-06-15',
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
    isoDate: '2026-06-22',
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
    isoDate: '2026-06-27',
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
  isoDate: '2026-07-03',
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

// Best-effort match between an API-FOOTBALL player name (e.g. "Mohamed Salah")
// and our local squad photos (file names are usually surnames, e.g. "salah").
// Falls back to null so the caller can render an initials avatar instead.
const localPhotoFor = (apiName: string): { src: string; number: string | null } | null => {
  if (!apiName) return null;
  const norm = apiName.toLowerCase();
  const found = SQUAD.find((p) => {
    const file = p.file.toLowerCase().replace(/[^a-z]/g, '');
    const disp = (p.displayName || '').toLowerCase();
    return (file && norm.replace(/[^a-z\s]/g, '').includes(file)) || (disp && norm.includes(disp));
  });
  return found ? { src: `/${found.file}.webp`, number: found.number } : null;
};

const initialsFor = (name: string): string => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
};

// Minimal bilingual dictionary for the UI chrome (header, matches page,
// footer, stats panel, lineup modal). Player names / API data stay as-is.
const STRINGS = {
  groupSummary: { ar: 'المجموعة G · المركز الثاني · تأهل', en: 'GROUP G · 2ND PLACE · QUALIFIED' },
  matchesTitle: { ar: 'مباريات مصر', en: "Egypt's Matches" },
  record: { ar: '1 فوز · 2 تعادل · 0 خسارة — 5 نقاط', en: '1W · 2D · 0L — 5 PTS' },
  live: { ar: 'مباشر', en: 'LIVE' },
  now: { ar: 'الآن', en: 'NOW' },
  upcoming: { ar: 'قادمة', en: 'UPCOMING' },
  fullTime: { ar: 'انتهت المباراة', en: 'FULL TIME' },
  staticPreview: { ar: '· بيانات تقريبية', en: '· static preview' },
  tapForLineup: { ar: 'اضغط لعرض التشكيل والإحصائيات', en: 'Tap for lineup & stats' },
  home: { ar: 'أرض الديار', en: 'HOME' },
  away: { ar: 'خارج الديار', en: 'AWAY' },
  win: { ar: 'فوز', en: 'WIN' },
  draw: { ar: 'تعادل', en: 'DRAW' },
  loss: { ar: 'خسارة', en: 'LOSS' },
  discoverLabel: { ar: 'كأس العالم 2026', en: '2026 WORLD CUP' },
  discoverTitle: { ar: 'منتخب مصر', en: 'EGYPT SQUAD' },
  pageDesc: {
    ar: 'تصفح تشكيلة منتخب مصر واستخدم السيكشنز بالأعلى للتنقل بين المراكز واللاعبين.',
    en: 'Browse the Egypt squad and use the sections above to move between players.',
  },
  footer: {
    ar: 'هذا الموقع غير رسمي وغير تابع للاتحاد المصري لكرة القدم. تصميم عبدالله الصاوي',
    en: 'This website is unofficial and not affiliated with the Egyptian Football Association. Designed by Abdullah ElSawy',
  },
  // Player stats panel
  playerStats: { ar: 'إحصائيات اللاعب', en: 'Player Stats' },
  minutesPlayed: { ar: 'الدقائق الملعوبة', en: 'Minutes Played' },
  appearancesLabel: { ar: 'المباريات', en: 'Appearances' },
  startsLabel: { ar: 'أساسي', en: 'Starts' },
  goalsLabel: { ar: 'الأهداف', en: 'Goals' },
  assistsLabel: { ar: 'الأسيست', en: 'Assists' },
  yellowCardsLabel: { ar: 'الكروت الصفراء', en: 'Yellow Cards' },
  cleanSheetsLabel: { ar: 'الشباك النظيفة', en: 'Clean Sheets' },
  noStatsData: { ar: 'لا توجد بيانات متاحة لهذا اللاعب حاليًا', en: 'No data available for this player yet' },
  loadingStats: { ar: 'جاري تحميل الإحصائيات...', en: 'Loading stats...' },
  // Lineup modal
  lineupTitle: { ar: 'التشكيل الأساسي', en: 'Starting XI' },
  substitutesTitle: { ar: 'البدلاء', en: 'Substitutes' },
  cameOn: { ar: 'شارك', en: 'came on' },
  matchStats: { ar: 'إحصائيات المباراة', en: 'Match Stats' },
  noLineupData: { ar: 'التشكيل غير متاح حاليًا لهذه المباراة', en: 'Lineup not available for this match yet' },
  loadingLineup: { ar: 'جاري تحميل التشكيل...', en: 'Loading lineup...' },
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

  // UI language toggle (site chrome only — player photos/names are unaffected)
  const [lang, setLang] = useState<'ar' | 'en'>('en');
  const t = useCallback((key: keyof typeof STRINGS) => STRINGS[key][lang], [lang]);

  // Player stats panel (opens when tapping the centered/active player)
  const [statsOpen, setStatsOpen] = useState(false);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState(false);
  const [statsData, setStatsData] = useState<null | {
    name: string; minutes: number; appearances: number; starts: number;
    goals: number; assists: number; yellowCards: number; cleanSheets: number;
  }>(null);
  const [statsPlayerName, setStatsPlayerName] = useState('');

  // Looked up by shirt/squad number rather than name — our local squad
  // names (photo filenames, e.g. "salah") rarely match TheSportsDB's full
  // player names exactly, so matching by number is far more reliable.
  const openPlayerStats = useCallback((player: { name: string; number?: string | null }) => {
    setStatsPlayerName(player.name);
    setStatsOpen(true);
    setStatsLoading(true);
    setStatsError(false);
    setStatsData(null);
    const query = player.number
      ? `number=${encodeURIComponent(player.number)}`
      : `name=${encodeURIComponent(player.name)}`;
    fetch(`/api/player-tournament-stats?${query}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.available) setStatsData(d);
        else setStatsError(true);
      })
      .catch(() => setStatsError(true))
      .finally(() => setStatsLoading(false));
  }, []);

  // Match lineup modal (opens when tapping a match card on the Matches page)
  const [lineupOpen, setLineupOpen] = useState(false);
  const [lineupLoading, setLineupLoading] = useState(false);
  const [lineupError, setLineupError] = useState(false);
  const [lineupData, setLineupData] = useState<any>(null);
  const [lineupOpponent, setLineupOpponent] = useState('');

  const openLineup = useCallback((isoDate: string, opponent: string) => {
    setLineupOpponent(opponent);
    setLineupOpen(true);
    setLineupLoading(true);
    setLineupError(false);
    setLineupData(null);
    fetch(`/api/match-lineup?date=${encodeURIComponent(isoDate)}&opponent=${encodeURIComponent(opponent)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d && d.available) setLineupData(d);
        else setLineupError(true);
      })
      .catch(() => setLineupError(true))
      .finally(() => setLineupLoading(false));
  }, []);

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
    setStatsOpen(false);

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
  const getRoleStyle = (role: 'center' | 'left' | 'right' | 'back' | 'statsFocus') => {
    const transition = 'transform 650ms cubic-bezier(0.4, 0, 0.2, 1), filter 650ms cubic-bezier(0.4, 0, 0.2, 1), opacity 650ms cubic-bezier(0.4, 0, 0.2, 1), left 650ms cubic-bezier(0.4, 0, 0.2, 1), bottom 650ms cubic-bezier(0.4, 0, 0.2, 1), height 650ms cubic-bezier(0.4, 0, 0.2, 1)';
    const baseStyle = {
      position: 'absolute' as const,
      aspectRatio: '0.6 / 1',
      transition,
      willChange: 'transform, filter, opacity, left',
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
      // The player photo slides here when its stats panel is open.
      // Desktop: shifts left to make room for the panel beside it.
      // Mobile: moves to the top-center instead — photo, name and stats
      // then read as one stacked column instead of photo-left/panel-right.
      case 'statsFocus':
        return {
          ...baseStyle,
          left: isMobile ? '50%' : '22%',
          bottom: isMobile ? '50%' : '0',
          height: isMobile ? '38%' : '82%',
          transform: `translateX(-50%) scale(${isMobile ? 1 : 1.05})`,
          filter: 'blur(0px)',
          opacity: 1,
          zIndex: 30,
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
        <header className="absolute top-2 sm:top-6 left-4 right-4 sm:left-8 sm:right-8 z-[60] flex flex-col md:flex-row gap-2 sm:gap-4 items-center justify-between pointer-events-auto w-full max-w-[calc(100%-2rem)] sm:max-w-[calc(100%-4rem)]">
          <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-6">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveIndex(0)}
                className="text-sm font-bold uppercase tracking-[0.2em] text-white hover:text-white/80 transition-all duration-150"
              >
                {lang === 'ar'
                  ? SECTIONS.find((sec) => sec.id === selectedSection)?.nameAr || 'الفريق'
                  : SECTIONS.find((sec) => sec.id === selectedSection)?.nameEn || 'TEAM'}
              </button>

              {/* Language toggle */}
              <button
                onClick={() => setLang((l) => (l === 'ar' ? 'en' : 'ar'))}
                aria-label="Toggle language"
                className="flex items-center gap-1 text-[10px] font-bold text-white/75 hover:text-white bg-white/10 hover:bg-white/20 border border-white/20 rounded-full px-2 py-1 transition-all duration-150"
              >
                <Languages size={12} strokeWidth={2.25} />
                <span>{lang === 'ar' ? 'EN' : 'AR'}</span>
              </button>
            </div>
            
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
                    <span>{lang === 'ar' ? sec.nameAr : sec.nameEn}</span>
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
          className="absolute inset-x-0 flex items-center justify-center pointer-events-none select-none z-2 text-white font-display uppercase tracking-tighter transition-opacity duration-500"
          style={{
            top: '18%',
            fontSize: getSingleWordFontSize(displayName),
            fontWeight: 900,
            lineHeight: 0.85,
            letterSpacing: '-0.02em',
            whiteSpace: 'pre-line',
            opacity: statsOpen ? 0 : 0.95,
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
            let role: 'center' | 'left' | 'right' | 'back' | 'statsFocus';
            const total = sectionPlayers.length;
            if (i === activeIndex) {
              role = statsOpen ? 'statsFocus' : 'center';
            } else if (statsOpen) {
              // Everything else steps out of the way while stats are shown.
              role = 'back';
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

            // Only mount the <img> for slides within 2 steps of the active
            // one (max 5 concurrent photos) instead of the whole squad.
            // Keeps a 1-step buffer on each side so the *next* left/right
            // slide is already loaded by the time it becomes visible —
            // avoids loading all ~27 photos (≈20MB) up front, which was
            // the main cause of navigation feeling heavy, especially on
            // mobile.
            const circularDistance = Math.min(
              Math.abs(i - activeIndex),
              total - Math.abs(i - activeIndex)
            );
            const shouldLoadImage = circularDistance <= 2;

            return (
              <div 
                key={item.id} 
                id={`figurine-item-${i}`}
                style={style}
                className="group select-none flex items-center justify-center cursor-pointer pointer-events-auto"
                onClick={() => {
                  if (i === activeIndex) {
                    if (statsOpen) {
                      setStatsOpen(false);
                    } else {
                      openPlayerStats(item);
                    }
                  } else if (!isAnimating && !statsOpen) {
                    setIsAnimating(true);
                    setActiveIndex(i);
                    setTimeout(() => setIsAnimating(false), 650);
                  }
                }}
              >
                {shouldLoadImage && (
                  <img 
                    src={item.src} 
                    alt={item.name}
                    className="absolute inset-0 w-full h-full object-contain object-bottom select-none pointer-events-none transition-transform duration-500 group-hover:scale-105"
                    draggable={false}
                    decoding="async"
                    fetchPriority={i === activeIndex ? 'high' : 'low'}
                  />
                )}
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
                {t('groupSummary')}
              </span>
              <h2
                className="font-display uppercase tracking-tighter mt-1"
                style={{ fontSize: 'clamp(28px, 6vw, 56px)', fontWeight: 900, lineHeight: 0.95 }}
              >
                {t('matchesTitle')}
              </h2>
              <span className="text-xs sm:text-sm text-white/70 font-mono">{t('record')}</span>
            </div>

            {/* Live knockout match */}
            <div
              onClick={() => openLineup(LIVE_MATCH.isoDate, liveDisplay.opponent)}
              className="w-full max-w-md rounded-2xl border border-red-400/40 bg-white/10 backdrop-blur-lg p-5 sm:p-6 text-white shadow-lg shadow-black/20 cursor-pointer hover:bg-white/15 transition-colors duration-200"
            >
              <div className="flex items-center justify-between mb-3">
                {liveDisplay.isLive ? (
                  <span className="flex items-center gap-1.5 text-[11px] font-bold tracking-widest text-red-400">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {t('live')} {liveDisplay.minute ? `· ${liveDisplay.minute}'` : t('now')}
                  </span>
                ) : liveDisplay.isUpcoming ? (
                  <span className="text-[11px] font-bold tracking-widest text-white/70">{t('upcoming')}</span>
                ) : (
                  <span className="text-[11px] font-bold tracking-widest text-white/50">{t('fullTime')}</span>
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
                {(liveDisplay.isFallback || liveMatchError) && ` ${t('staticPreview')}`}
              </div>
              <div className="text-center mt-2 text-[9px] sm:text-[10px] text-white/40 font-mono">
                {t('tapForLineup')}
              </div>
            </div>

            {/* Group-stage matches */}
            <div className="w-full grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-5">
              {GROUP_MATCHES.map((m) => (
                <div
                  key={m.id}
                  onClick={() => openLineup(m.isoDate, m.opponent)}
                  className="rounded-2xl border border-white/15 bg-white/5 backdrop-blur-lg p-4 sm:p-5 text-white flex flex-col items-center gap-2 hover:bg-white/10 transition-colors duration-200 cursor-pointer"
                >
                  <span className="text-[10px] font-mono tracking-widest text-white/50">{m.matchday}</span>

                  <div className="flex items-center gap-3 sm:gap-4 mt-1">
                    <div className="flex flex-col items-center">
                      <span className="text-2xl sm:text-3xl">🇪🇬</span>
                      <span className="text-[10px] mt-1 font-mono text-white/60">{m.home ? t('home') : t('away')}</span>
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
                    {m.result === 'W' ? t('win') : m.result === 'D' ? t('draw') : t('loss')}
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
          className={`absolute bottom-12 left-4 right-4 sm:bottom-16 sm:left-24 z-[60] max-w-sm sm:max-w-md text-white transition-opacity duration-300 ${
            statsOpen && isMobile ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto'
          }`}
        >
          <p className={`font-sans font-bold uppercase tracking-widest mb-1 sm:mb-2 text-base sm:text-[22px] flex items-baseline gap-3 transition-opacity duration-300 ${statsOpen ? 'opacity-0' : 'opacity-95'}`}>
            <span>{displayName}</span>
            {jerseyLabel && (
              <span className="font-mono text-xs opacity-60 tracking-normal">{jerseyLabel}</span>
            )}
          </p>

          <p className={`hidden sm:block text-xs leading-relaxed mb-4 font-normal transition-opacity duration-300 ${statsOpen ? 'opacity-0' : 'opacity-75'}`}>
            {t('pageDesc')}
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
            {t('discoverLabel')}
          </span>
          <div
            className="flex items-center gap-2 font-display uppercase tracking-tight text-white/90"
            style={{
              fontSize: 'clamp(18px, 3vw, 42px)',
              fontWeight: 400,
              lineHeight: 1,
            }}
          >
            <span>{t('discoverTitle')}</span>
          </div>
        </div>
        )}

        {/* Footer disclaimer — kept clear of the bottom details panel above it */}
        <div
          id="site-footer"
          className="absolute bottom-1 inset-x-0 z-[55] text-center pointer-events-none px-4"
        >
          <p className="text-[8px] sm:text-[10px] text-white/45 font-mono tracking-wide leading-snug">
            {t('footer')} · +201061163091
          </p>
        </div>

        {/* Player Stats — appears beside the photo once it slides over, no popup/backdrop */}
        {isTeamPage && (
        <div
          className={`absolute z-40 text-white transition-all duration-500 ease-out ${
            statsOpen ? 'opacity-100 translate-x-0 pointer-events-auto' : 'opacity-0 translate-x-4 pointer-events-none'
          } ${isMobile ? 'text-center' : ''}`}
          style={
            isMobile
              ? { left: '8%', right: '8%', top: '52%', bottom: '4%' }
              : { left: '46%', right: '7%', top: '18%', bottom: '14%' }
          }
        >
          <button
            onClick={() => setStatsOpen(false)}
            aria-label="Close"
            className="absolute -top-2 end-0 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 backdrop-blur-md transition-colors"
          >
            <X size={16} />
          </button>

          <p className="text-[10px] uppercase tracking-widest text-white/50 font-mono mb-1">{t('playerStats')}</p>
          <h3 className="font-display uppercase text-xl sm:text-3xl font-black tracking-tight mb-4 sm:mb-6 pe-10">
            {statsPlayerName}
          </h3>

          {statsLoading && (
            <div className="text-sm text-white/60">{t('loadingStats')}</div>
          )}

          {!statsLoading && (statsError || !statsData) && (
            <div className="text-sm text-white/60 max-w-xs">{t('noStatsData')}</div>
          )}

          {!statsLoading && statsData && (
            <div className={`grid grid-cols-2 gap-2.5 sm:gap-3 max-w-md ${isMobile ? 'mx-auto' : ''}`}>
              {[
                { icon: Clock, label: t('minutesPlayed'), value: statsData.minutes },
                { icon: Footprints, label: t('appearancesLabel'), value: statsData.appearances },
                { icon: Target, label: t('goalsLabel'), value: statsData.goals },
                { icon: Handshake, label: t('assistsLabel'), value: statsData.assists },
                { icon: Sparkles, label: t('startsLabel'), value: statsData.starts },
                { icon: Shield, label: t('cleanSheetsLabel'), value: statsData.cleanSheets },
              ].map((row, idx) => (
                <div key={idx} className={`rounded-2xl bg-white/10 border border-white/15 backdrop-blur-md p-3 sm:p-3.5 flex flex-col gap-1.5 ${isMobile ? 'items-center' : ''}`}>
                  <row.icon size={16} className="text-white/50" strokeWidth={2} />
                  <span className="text-xl sm:text-2xl font-bold font-mono">{row.value}</span>
                  <span className="text-[9.5px] sm:text-[10px] uppercase tracking-wide text-white/50">{row.label}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        )}

        {/* Match Lineup Modal */}
        <div
          className={`fixed inset-0 z-[95] flex items-end sm:items-center justify-center transition-opacity duration-300 ${
            lineupOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          dir={lang === 'ar' ? 'rtl' : 'ltr'}
        >
          <div
            onClick={() => setLineupOpen(false)}
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
          />
          <div
            className={`relative w-full sm:max-w-2xl max-h-[88vh] overflow-y-auto bg-[#12201a]/90 border border-white/15 backdrop-blur-2xl rounded-t-3xl sm:rounded-3xl p-5 sm:p-7 text-white shadow-2xl transition-transform duration-400 ease-out ${
              lineupOpen ? 'translate-y-0' : 'translate-y-full sm:translate-y-10'
            }`}
          >
            <button
              onClick={() => setLineupOpen(false)}
              aria-label="Close"
              className="absolute top-4 end-4 w-8 h-8 rounded-full flex items-center justify-center bg-white/10 hover:bg-white/20 border border-white/20 transition-colors z-10"
            >
              <X size={16} />
            </button>

            <p className="text-[10px] uppercase tracking-widest text-white/50 font-mono mb-1">🇪🇬 vs {lineupOpponent}</p>
            <h3 className="font-display uppercase text-xl sm:text-2xl font-black tracking-tight mb-5">
              {t('lineupTitle')}{lineupData?.formation ? ` · ${lineupData.formation}` : ''}
            </h3>

            {lineupLoading && (
              <div className="py-10 text-center text-sm text-white/60">{t('loadingLineup')}</div>
            )}

            {!lineupLoading && (lineupError || !lineupData) && (
              <div className="py-10 text-center text-sm text-white/60">{t('noLineupData')}</div>
            )}

            {!lineupLoading && lineupData && (
              <>
                {/* Pitch board */}
                <LineupPitch startXI={lineupData.startXI} />

                {/* Substitutes */}
                {lineupData.substitutes?.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[10px] uppercase tracking-widest text-white/50 font-mono mb-2">
                      {t('substitutesTitle')}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {lineupData.substitutes.map((s: any, idx: number) => {
                        const photo = localPhotoFor(s.name);
                        return (
                          <div key={idx} className="flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 p-2">
                            {photo ? (
                              <img src={photo.src} alt={s.name} className="w-8 h-8 rounded-full object-cover object-top bg-white/10" />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold">
                                {initialsFor(s.name)}
                              </div>
                            )}
                            <div className="flex flex-col min-w-0">
                              <span className="text-xs font-semibold truncate">{s.name}</span>
                              {s.cameOn && (
                                <span className="text-[9px] text-emerald-300 uppercase tracking-wide">{t('cameOn')}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Match statistics */}
                {lineupData.statistics?.length > 0 && (
                  <div className="mt-6">
                    <p className="text-[10px] uppercase tracking-widest text-white/50 font-mono mb-3">
                      {t('matchStats')}
                    </p>
                    <div className="flex flex-col gap-3">
                      {lineupData.statistics.map((s: any, idx: number) => (
                        <StatBar key={idx} label={s.type} egypt={s.egypt} opponent={s.opponent} />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Renders the starting XI on a schematic pitch using each player's
// API-FOOTBALL "grid" position (row:col), falling back gracefully when
// a player has no local photo (initials avatar instead).
function LineupPitch({ startXI }: { startXI: { name: string; number: string | null; pos: string | null; grid: string | null }[] }) {
  const withGrid = (startXI || []).filter((p) => p.grid);
  const rows = withGrid.map((p) => Number(p.grid!.split(':')[0]));
  const maxRow = rows.length ? Math.max(...rows) : 1;

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border border-white/15"
      style={{
        aspectRatio: '3 / 4',
        background: 'repeating-linear-gradient(0deg, #1e5c3a, #1e5c3a 10%, #226640 10%, #226640 20%)',
      }}
    >
      {/* Center line + circle for a minimal pitch feel */}
      <div className="absolute left-0 right-0 top-1/2 h-px bg-white/25" />
      <div className="absolute left-1/2 top-1/2 w-16 h-16 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/25" />
      <div className="absolute left-1/2 top-0 w-24 h-10 -translate-x-1/2 border border-white/20 border-t-0" />
      <div className="absolute left-1/2 bottom-0 w-24 h-10 -translate-x-1/2 border border-white/20 border-b-0" />

      {(startXI || []).map((p, i) => {
        if (!p.grid) return null;
        const [rowStr] = p.grid.split(':');
        const row = Number(rowStr);
        const rowPlayers = withGrid.filter((pl) => Number(pl.grid!.split(':')[0]) === row);
        const orderInRow = rowPlayers.findIndex((pl) => pl.name === p.name);
        const top = 92 - ((row - 1) / Math.max(1, maxRow - 1)) * 84;
        const left = ((orderInRow + 1) / (rowPlayers.length + 1)) * 100;
        const photo = localPhotoFor(p.name);

        return (
          <div
            key={i}
            className="absolute flex flex-col items-center gap-1 -translate-x-1/2 -translate-y-1/2"
            style={{ top: `${top}%`, left: `${left}%`, width: '20%' }}
          >
            {photo ? (
              <img
                src={photo.src}
                alt={p.name}
                className="w-9 h-9 sm:w-11 sm:h-11 rounded-full object-cover object-top border-2 border-white/70 bg-white/10 shadow-md"
              />
            ) : (
              <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/15 border-2 border-white/70 flex items-center justify-center text-[11px] font-bold shadow-md">
                {initialsFor(p.name)}
              </div>
            )}
            <span className="text-[8.5px] sm:text-[9.5px] font-semibold text-white text-center leading-tight max-w-full truncate px-0.5 bg-black/30 rounded">
              {p.name?.split(' ').slice(-1)[0]}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Simple side-by-side comparison bar for a single match statistic.
function StatBar({ label, egypt, opponent }: { key?: any; label: string; egypt: any; opponent: any }) {
  const parseVal = (v: any) => {
    if (v === null || v === undefined) return 0;
    const n = parseFloat(String(v).replace('%', ''));
    return Number.isNaN(n) ? 0 : n;
  };
  const egyVal = parseVal(egypt);
  const oppVal = parseVal(opponent);
  const total = egyVal + oppVal || 1;
  const egyPct = (egyVal / total) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-[11px] font-mono mb-1">
        <span>{egypt ?? '–'}</span>
        <span className="text-white/50 uppercase tracking-wide text-[10px]">{label}</span>
        <span>{opponent ?? '–'}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden flex">
        <div className="h-full bg-emerald-400" style={{ width: `${egyPct}%` }} />
        <div className="h-full bg-white/30 flex-1" />
      </div>
    </div>
  );
}
