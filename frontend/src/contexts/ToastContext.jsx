import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import Toast from '../components/ui/Toast';
import { t } from '../utils/i18n';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = ++nextId.current; // a counter, not the clock: two toasts in the same millisecond must not share an id
    // The server sometimes answers with a message KEY ("customer_created"); t() turns it into words in the person's language,
    // and leaves a ready-made sentence alone.
    setToasts((prev) => [...prev, { id, message: typeof message === 'string' ? t(message) : message, type, duration }]);
    
    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const showSuccess = useCallback((message, duration) => {
    addToast(message, 'success', duration);
  }, [addToast]);

  const showError = useCallback((message, duration) => {
    addToast(message, 'error', duration);
  }, [addToast]);

  const showWarning = useCallback((message, duration) => {
    addToast(message, 'warning', duration);
  }, [addToast]);

  const showInfo = useCallback((message, duration) => {
    addToast(message, 'info', duration);
  }, [addToast]);

  // Messages from code that is not a component (lib/toast.js: export and PDF helpers).
  useEffect(() => {
    const onToast = (e) => { const { type, message } = e.detail || {}; if (message) addToast(message, type || 'info'); };
    window.addEventListener('biztrack:toast', onToast);
    return () => window.removeEventListener('biztrack:toast', onToast);
  }, [addToast]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showWarning, showInfo }}>
      {children}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
