function computeStatus(freeKg, totalKg) {
  if (freeKg <= 0) return "red";
  const ratio = freeKg / totalKg;
  if (ratio <= 0.2) return "yellow";
  return "green";
}

module.exports = { computeStatus };
