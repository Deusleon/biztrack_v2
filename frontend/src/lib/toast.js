// FILE PATH: frontend/src/lib/toast.js
/**
 * Toasts from code that is not a React component (number formatting, export and PDF helpers).
 * ToastContext listens for the event and shows them in the same stack as every other message.
 */
const send = (type) => (message) => { if (message) window.dispatchEvent(new CustomEvent('biztrack:toast', { detail: { type, message: String(message) } })); };
export const toast = { success: send('success'), error: send('error'), warning: send('warning'), info: send('info'), message: send('info') };
