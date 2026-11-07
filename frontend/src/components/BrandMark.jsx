// FILE PATH: frontend/src/components/BrandMark.jsx
/** The BizTrack emblem. */
export default function BrandMark({ className = 'w-12 h-auto', alt = 'BizTrack' }) {
  return <img src="/icon-192.png" alt={alt} className={`${className} rounded-lg`} draggable={false} />;
}
