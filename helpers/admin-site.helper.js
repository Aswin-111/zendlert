export const ensureAdminOrganizationOrError = (res, organizationId) => {
  if (!organizationId) {
    res.status(401).json({ error: "Unauthorized" });
    return false;
  }
  return true;
};

export const ensureSiteIdOrError = (res, siteId) => {
  if (!siteId) {
    res.status(400).json({ error: "siteId is required" });
    return false;
  }
  return true;
};

export const buildSiteAddress = (site) =>
  [
    site?.address_line_1,
    site?.address_line_2,
    site?.city,
    site?.state,
    site?.zip_code,
  ]
    .filter(Boolean)
    .join(", ");

export const findSiteForOrganization = (prisma, siteId, organizationId, select) =>
  prisma.sites.findFirst({
    where: { id: siteId, organization_id: organizationId },
    select,
  });
