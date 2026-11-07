export const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiry = payload.exp;
    const now = Math.floor(Date.now() / 1000);
    return expiry < now;
  } catch (err) {
    console.error("Failed to parse token", err);
    return true;
  }
};
