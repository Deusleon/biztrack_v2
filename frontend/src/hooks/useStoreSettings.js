import { useStoreSettingsContext } from '../contexts/StoreSettingsContext';
/** Store settings (business name, currency, decimals…) read from the shared cache; same shape BizTrack always used. */
export const useStoreSettings = () => useStoreSettingsContext();
