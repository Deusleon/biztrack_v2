import { useEffect, useRef } from 'react';
import { useStore } from '../contexts/StoreContext';
import { useStoreSettings } from './useStoreSettings';
import { reportDates } from '../utils/dateRange';

/**
 * Puts the store's configured report range into start/end dates, then loads
 * that range. A later edit on this visit is kept. Changing store or the
 * setting applies the new range again.
 */
export function useDefaultReportRange(range, setRange) {
  const { currentStore } = useStore();
  const { settings } = useStoreSettings();
  const period = settings?.defaultReportDateRange;
  const configured = reportDates(period);
  const edited = useRef(false);

  useEffect(() => { edited.current = false; }, [currentStore?.id, period]);

  useEffect(() => {
    if (!configured || edited.current) return;
    if (range.startDate === configured.startDate && range.endDate === configured.endDate) return;
    setRange((current) => ({ ...current, startDate: configured.startDate, endDate: configured.endDate }));
  }, [configured?.startDate, configured?.endDate, currentStore?.id, period]); // eslint-disable-line react-hooks/exhaustive-deps

  const ready = !configured || edited.current || (range.startDate === configured.startDate && range.endDate === configured.endDate);
  const touch = () => { edited.current = true; };
  return { ready, touch, configured };
}
