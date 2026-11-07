
function cleanPhone(phone) {
    if (!phone) return null;
    const trimmed = phone.trim();
    if (/^\+?[0-9]{1,4}$/.test(trimmed)) return null;
    return trimmed;
};

export { cleanPhone };

