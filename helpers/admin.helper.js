export const getEmailDomainOrThrow = (email) => {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const parts = normalizedEmail.split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    const error = new Error("Invalid email format.");
    error.statusCode = 400;
    throw error;
  }
  return parts[1];
};

export const normalizeDomain = (domainOrEmail = "") => {
  const normalized = String(domainOrEmail).trim().toLowerCase();
  const atIndex = normalized.lastIndexOf("@");
  return atIndex >= 0 ? normalized.slice(atIndex + 1) : normalized;
};
