// FILE PATH: frontend/src/contexts/SubscriptionContext.jsx
import { createContext, useContext, useState, useEffect } from 'react';
import { useStore } from './StoreContext';

const SubscriptionContext = createContext({ locked: false });

/**
 * Whether the current store's subscription has lapsed. The server answers 402 to everything once it has;
 * utils/api.js announces that, and the app then shows the Subscription page instead of a screen of errors.
 * Switching to another store starts fresh (its subscription may be fine).
 */
export const SubscriptionProvider = ({ children }) => {
  const { currentStore } = useStore();
  const [locked, setLocked] = useState(false);

  useEffect(() => { setLocked(false); }, [currentStore?.id]);
  useEffect(() => {
    const on = () => setLocked(true);
    window.addEventListener('biztrack:subscription-locked', on);
    return () => window.removeEventListener('biztrack:subscription-locked', on);
  }, []);

  return <SubscriptionContext.Provider value={{ locked, unlock: () => setLocked(false) }}>{children}</SubscriptionContext.Provider>;
};

export const useSubscription = () => useContext(SubscriptionContext);
