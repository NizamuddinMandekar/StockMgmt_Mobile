import { Platform } from 'react-native';

export const colors = {
  ink: '#0F172A',
  accent: '#059669',
  accentBg: 'rgba(5,150,105,0.1)',
  bg: '#F7F8FA',
  card: '#FFFFFF',
  border: '#E6E8EA',
  text: '#0F172A',
  textMuted: '#64748B',
  textFaint: '#94A3B8',
  danger: '#DC2626',
  dangerBg: 'rgba(220,38,38,0.08)',
  warning: '#D97706',
  warningBg: 'rgba(217,119,6,0.1)',
  success: '#059669',
  successBg: 'rgba(5,150,105,0.1)',
  pill: '#F1F5F9',
  pillText: '#475569',
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
};

// A lifted-card look reads as premium/native rather than the flat bordered
// box a web app would use - kept subtle (low opacity/offset) so it doesn't
// look skeuomorphic. Android has no shadow* support outside `elevation`, so
// each level maps to both.
export const shadows = {
  sm: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
    default: {},
  }),
  md: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 10,
    },
    android: { elevation: 4 },
    default: {},
  }),
  lg: Platform.select({
    ios: {
      shadowColor: '#0F172A',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 20,
    },
    android: { elevation: 10 },
    default: {},
  }),
};

export const type = {
  title: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  body: { fontSize: 15, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  caption: { fontSize: 12, fontWeight: '500' },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
};
