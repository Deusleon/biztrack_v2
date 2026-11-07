// src/lib/socket.js
import { io } from "socket.io-client";

// ONE shared socket for the whole app. Previously every call created a brand
// new connection that was never closed, so each page navigation leaked a
// socket (duplicate notifications + growing server load). Now repeated calls
// with the same credentials reuse the open connection, and a change of
// user/store re-uses the same socket object (so listeners stay attached).
let socket = null;

export function connectSocket({ userId, storeId, role }) {
  const auth = { userId, storeId, role };

  if (!socket) {
    socket = io(import.meta.env.VITE_SOCKET_URL, { auth });
    return socket;
  }

  const current = socket.auth || {};
  const sameAuth =
    current.userId === userId &&
    current.storeId === storeId &&
    current.role === role;

  // Already connected (or busy connecting/reconnecting) with the same identity
  if (sameAuth && (socket.connected || socket.active)) return socket;

  socket.auth = auth;
  if (socket.connected) socket.disconnect();
  socket.connect();
  return socket;
}

export function getSocket() {
  return socket;
}

export function disconnectSocket() {
  if (socket) socket.disconnect();
}
