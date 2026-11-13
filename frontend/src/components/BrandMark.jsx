// FILE PATH: frontend/src/components/BrandMark.jsx
/**
 * The BizTrack emblem (the B with the rising arrow), with no background of its own.
 *   variant="white"  – the emblem in white, for the dark gradient headers (sidebar, sign-in)      ← default
 *   variant="color"  – the full-colour emblem, for white or light backgrounds
 *   variant="full"   – the full logo with the BizTrack name and slogan, for light backgrounds
 */
const SOURCES = { white: '/brand-emblem-white.png?v=4', color: '/brand-emblem.png?v=4', full: '/logo-full.png?v=4' };

export default function BrandMark({ className = 'w-12 h-auto', alt = 'BizTrack', variant = 'white' }) {
  return <img src={SOURCES[variant] || SOURCES.white} alt={alt} className={className} draggable={false} />;
}
