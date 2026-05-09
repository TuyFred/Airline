function notFound(req, res) {
  return res.status(404).json({ message: "Route not found" });
}

function errorHandler(err, req, res, next) {
  console.error("[ERROR]", err);
  return res.status(err.status || 500).json({ message: err.message || "Internal server error" });
}

module.exports = { notFound, errorHandler };
