// FILE PATH: frontend/src/services/SettingsService.js
// Settings calls in the shape the export / PDF code expects: the reply keeps its `.data` wrapper.
import api from '../utils/api';

/** All settings of the current store: { data: { systemSettings, storeSettings } } */
export const getStoreSettings = async () => ({ data: await api.get('/settings') });
export const updateStoreSettings = async (storeId, storeData) => ({ data: await api.put(`/settings/${storeId}`, storeData) });
export const getSettings = async (storeId) => api.get(`/settings/${storeId}`);
