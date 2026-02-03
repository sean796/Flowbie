/**
 * Cyberpunk Theme Utilities
 * Shared theme constants and utilities for DeathStar-style cyberpunk aesthetic
 */

// Color Palette
export const CYBERPUNK_COLORS = {
  background: '#0a0a0a',
  border: 'rgba(34, 197, 94, 0.5)', // green-500/50
  borderIntense: 'rgba(34, 197, 94, 0.8)',
  textPrimary: 'rgb(74, 222, 128)', // green-400
  textSecondary: 'rgba(34, 197, 94, 0.8)', // green-500/80
  glow: 'rgba(34, 197, 94, 0.5)',
  glowIntense: 'rgba(34, 197, 94, 0.8)',
  glowSubtle: 'rgba(34, 197, 94, 0.2)',
} as const;

// Animation Keyframes (CSS-in-JS style for inline styles)
export const BREATHE_NEON_ANIMATION = `
  @keyframes breatheNeon {
    0%, 100% { 
      box-shadow: 0 0 10px ${CYBERPUNK_COLORS.glow},
                  0 0 20px ${CYBERPUNK_COLORS.glowSubtle},
                  0 0 30px ${CYBERPUNK_COLORS.glowSubtle},
                  inset 0 0 10px ${CYBERPUNK_COLORS.glowSubtle};
    }
    50% { 
      box-shadow: 0 0 20px ${CYBERPUNK_COLORS.glowIntense},
                  0 0 40px ${CYBERPUNK_COLORS.glow},
                  0 0 60px ${CYBERPUNK_COLORS.glowSubtle},
                  inset 0 0 20px ${CYBERPUNK_COLORS.glow};
    }
  }
`;

// Tailwind Class Utilities
export const CYBERPUNK_CLASSES = {
  // Card/Container
  card: 'bg-[#0a0a0a] border-2 border-green-500/50',
  cardBreathe: 'bg-[#0a0a0a] border-2 border-green-500/50 animate-[breatheNeon_3s_ease-in-out_infinite]',
  cardHover: 'hover:border-green-500/70 hover:shadow-[0_0_15px_rgba(34,197,94,0.4)]',
  
  // Text - High contrast colors for better readability
  textPrimary: 'text-green-300 font-mono font-semibold', // Brighter green for better contrast
  textSecondary: 'text-green-300/90 font-mono font-medium', // Bright green instead of dim green-500
  textMuted: 'text-slate-300 font-mono font-medium', // Light grey instead of muted-foreground for better contrast
  
  // Borders
  borderNeon: 'border-green-500/50',
  borderNeonIntense: 'border-green-500/70',
  borderDivider: 'border-green-500/20',
  
  // Backgrounds
  bgNeon: 'bg-green-500/10',
  bgNeonHover: 'bg-green-500/20',
  bgNeonIntense: 'bg-green-500/20',
  
    // Buttons - Dark grey with bright green text, black/white on hover
    buttonNeon: 'bg-[#1a1a1a] border border-green-500/50 text-green-300 hover:bg-black hover:border-white/50 hover:text-white',
    buttonNeonActive: 'bg-black border-white/50 text-white shadow-[0_0_15px_rgba(34,197,94,0.4)]',
  
  // Glow Effects
  glow: 'shadow-[0_0_15px_rgba(34,197,94,0.4)]',
  glowIntense: 'shadow-[0_0_30px_rgba(34,197,94,0.6)]',
  
  // Status Indicators - High contrast colors
  statusSuccess: 'text-green-300',
  statusError: 'text-red-300',
  statusWarning: 'text-yellow-300',
  statusPending: 'text-slate-300',
} as const;

// Utility function to get cyberpunk card classes
export function getCyberpunkCardClasses(animate: boolean = false, hover: boolean = true): string {
  const base = animate ? CYBERPUNK_CLASSES.cardBreathe : CYBERPUNK_CLASSES.card;
  return hover ? `${base} ${CYBERPUNK_CLASSES.cardHover}` : base;
}

// Utility function to get cyberpunk text classes
export function getCyberpunkTextClasses(variant: 'primary' | 'secondary' | 'muted' = 'primary'): string {
  switch (variant) {
    case 'primary':
      return CYBERPUNK_CLASSES.textPrimary;
    case 'secondary':
      return CYBERPUNK_CLASSES.textSecondary;
    case 'muted':
      return CYBERPUNK_CLASSES.textMuted;
  }
}

// Utility function to get cyberpunk button classes
export function getCyberpunkButtonClasses(active: boolean = false): string {
  const base = CYBERPUNK_CLASSES.buttonNeon;
  return active ? `${base} ${CYBERPUNK_CLASSES.buttonNeonActive}` : base;
}

