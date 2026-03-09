export const findOrganizationById = (prisma, organizationId, options = {}) =>
  prisma.organizations.findUnique({
    where: { organization_id: String(organizationId) },
    ...options,
  });

export const findSiteByOrganization = (
  prisma,
  siteId,
  organizationId,
  options = {},
) =>
  prisma.sites.findFirst({
    where: { id: String(siteId), organization_id: String(organizationId) },
    ...options,
  });

export const findAreaByOrganization = (
  prisma,
  areaId,
  organizationId,
  options = {},
) =>
  prisma.areas.findFirst({
    where: {
      id: String(areaId),
      site: { organization_id: String(organizationId) },
    },
    ...options,
  });
