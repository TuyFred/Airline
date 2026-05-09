const ROLES = {
  EXPORTER: "exporter",
  AIRLINE_ANALYST: "airline_analyst",
  AIRLINE_SUPERVISOR: "airline_supervisor",
  CLEARING_AGENT: "clearing_agent",
  ADMIN: "admin"
};

const AIRLINES = [
  "RwandAir",
  "Ethiopian",
  "KLM",
  "Qatar",
  "Kenya Airways",
  "Brussels",
  "Turkish",
  "EgyptAir"
];

const COMMODITIES = ["Vegetables", "Flowers", "Chilli", "Fruits", "Others"];

const INVOICE_SETTINGS = {
  NO_SHOW_PERCENT: 0.7,
  DEFAULT_PRICE_PER_KG: 1.5,
  OVERDUE_DAYS: 7
};

module.exports = {
  ROLES,
  AIRLINES,
  COMMODITIES,
  INVOICE_SETTINGS
};
