// FILE PATH: frontend/src/components/BrandMark.jsx
/**
 *   variant="white"  – the same badge in white, for the dark sidebar and sign-in
 *   variant="color"  – the coloured badge, for white pages
 *   variant="full"   – the coloured badge with the BizTrack name
 */
const SOURCES = { white: '/brand-emblem-white.png?v=10', color: '/brand-emblem.png?v=8', full: '/logo-full.png?v=8' };

export default function BrandMark({ className = 'w-12 h-auto', alt = 'BizTrack', variant = 'white' }) {
  return <img src={SOURCES[variant] || SOURCES.white} alt={alt} className={className} draggable={false} />;
}
