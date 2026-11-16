// utils/getLang.js
// The language the screen is showing (sent as x-language) wins, so a toast matches the SW / EN switch.
// The language saved on the account is used when the request did not say.
const getLang = (req) => {
    const header = String(req.headers['x-language'] || req.headers['accept-language'] || '')
        .split(',')[0]
        .trim()
        .toLowerCase()
        .split('-')[0];
    if (header === 'en' || header === 'sw') return header;
    const saved = String(req.user?.preferred_language || req.user?.lang || '').toLowerCase().split('-')[0];
    return saved === 'sw' ? 'sw' : 'en';
};

export { getLang };

