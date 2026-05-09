let ioInstance;

function initSocket(io) {
  ioInstance = io;
}

function emitCapacityUpdate(payload) {
  if (!ioInstance) return;
  ioInstance.emit("capacity:update", payload);
}

function emitUserNotification(userId, payload) {
  if (!ioInstance) return;
  ioInstance.to(`user:${userId}`).emit("notification:new", payload);
}

module.exports = {
  initSocket,
  emitCapacityUpdate,
  emitUserNotification
};
