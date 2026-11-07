// utils/getLang.js
const getLang = (req) =>
    req.user?.preferred_language ||
    req.user?.lang ||
    req.headers['x-language'] ||
    req.headers['accept-language']?.split(',')[0] ||
    'en';

export { getLang };

