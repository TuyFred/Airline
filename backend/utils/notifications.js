const { query } = require("../config/db");
const { emitUserNotification } = require("../config/socket");

async function pushNotification(userId, title, message, type = "info") {
  const result = await query(
    `INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)`,
    [userId, title, message, type]
  );

  emitUserNotification(userId, {
    id: result.insertId,
    title,
    message,
    type,
    created_at: new Date().toISOString()
  });
}

module.exports = { pushNotification };
