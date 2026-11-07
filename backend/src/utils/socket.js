import pool from '../config/db.js';
// utils/socket.js
import * as _p36 from 'socket.io';
const {  Server  } = _p36.default ?? _p36;
let io;

function initSocket(server) {
  io = new Server(server, {
    cors: { origin: "*" }
  });

  io.on("connection", (socket) => {
    const { userId, storeId, role } = socket.handshake.auth;

    // always join the personal room
    socket.join(`user_${userId}`);

    // join the general store room
    if (storeId) socket.join(`store_${storeId}`);

    // join the role-specific room for that store
    if (storeId && role) {
      socket.join(`store_${storeId}_${role}`);
    }
    
  });

  return io;
}

function getIO() {
  if (!io) throw new Error("Socket.io not initialized!");
  return io;
}

function emitToStore(storeId, event, payload) {
  try {
    if (!io || !storeId || !event) return;
    io.to(`store_${storeId}`).emit(event, payload);
  } catch (err) {
    console.error("emitToStore error:", err.message);
  }
}

function emitToUser(userId, event, payload) {
  try {
    if (!io || !userId || !event) return;
    io.to(`user_${userId}`).emit(event, payload);
  } catch (err) {
    console.error("emitToUser error:", err.message);
  }
}

/**
 * Emit an in-app notification to all users of a store, respecting the store's
 * notification settings (inapp_<type> key in store_settings.settings.notifications).
 *
 * @param {number|string} storeId
 * @param {string} type  e.g. "new_sale" | "purchase_received" | "stock_transfer" | "low_stock" | "payment_due"
 * @param {object} payload  { title, message, meta }
 */
async function emitInAppNotification(storeId, type, payload) {
  try {
    if (!io) return;
    const result = await pool.query(
      "SELECT settings FROM store_settings WHERE store_id = $1",
      [storeId]
    );
    const notifications = result.rows[0]?.settings?.notifications || {};
    const key = `inapp_${type}`;
    // If explicitly set to false, skip
    if (notifications[key] === false) return;
    io.to(`store_${storeId}`).emit("inAppNotification", {
      type,
      ...payload,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error("emitInAppNotification error:", err.message);
  }
}

export { initSocket, getIO, emitToStore, emitToUser, emitInAppNotification };

