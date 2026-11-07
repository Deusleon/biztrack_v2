// FILE PATH: frontend/src/components/ui/FormModal.jsx
import { useEffect } from 'react';

const SIZES = { sm: 'max-w-sm', md: 'max-w-md', lg: 'max-w-2xl', xl: 'max-w-4xl' };

/**
 * The standard dialog for adding / editing a record — the same markup every EduTrack page writes by hand
 * (dimmed backdrop, white card, title bar with a close ×, scrolling body), kept in one place.
 *
 *   <FormModal isOpen={modal.isOpen} title="Edit Category" onClose={close} size="md">
 *     <form onSubmit={…}> … </form>
 *   </FormModal>
 *
 * Esc closes it; the page behind does not scroll while it is open.
 */
export default function FormModal({ isOpen, onClose, title, size = 'md', children }) {
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [isOpen, onClose]);

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded shadow-xl w-full ${SIZES[size] || SIZES.md}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-base font-semibold">{title}</h3>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="px-5 py-4 max-h-[75vh] overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
