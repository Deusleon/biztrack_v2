// FILE PATH: frontend/src/lib/axios.js
/**
 * The same client as utils/api.js (same base URL, token, store header, language, 401/402/428 handling) but it
 * resolves to the full axios response — `res.data.<field>` — which is what BizTrack's own helpers (PDF/Excel
 * export, receipts, settings) were written against. They keep working unchanged on top of this.
 * New screens use services/api.js instead.
 */
import { createApi } from '../utils/api';

export default createApi(false);
