export function getAuthContext(req) {
  const user = req.user || {};
  return {
    user_id: user.user_id || user.id || user.userId,
    organization_id: user.organization_id || user.organizationId,
  };
}

export async function buildAlertLocationsForAlerts(prisma, alertIds) {
  if (!alertIds?.length) return new Map();

  const [alertSites, alertAreas] = await Promise.all([
    prisma.alert_Sites.findMany({
      where: { alert_id: { in: alertIds } },
      include: {
        site: {
          select: {
            id: true,
            name: true,
            address_line_1: true,
            address_line_2: true,
            city: true,
            state: true,
            zip_code: true,
          },
        },
      },
    }),
    prisma.alert_Areas.findMany({
      where: { alert_id: { in: alertIds } },
      include: { area: { select: { name: true, site_id: true } } },
    }),
  ]);

  const siteIdsFromAreas = Array.from(
    new Set(alertAreas.map((row) => row.area?.site_id).filter(Boolean)),
  );

  const sitesForAreas = siteIdsFromAreas.length
    ? await prisma.sites.findMany({
        where: { id: { in: siteIdsFromAreas } },
        select: { id: true, name: true },
      })
    : [];

  const siteNameById = new Map(sitesForAreas.map((site) => [site.id, site.name]));

  const locationMap = new Map();
  for (const id of alertIds) locationMap.set(id, []);

  for (const row of alertSites) {
    const locations = locationMap.get(row.alert_id);
    if (!locations) continue;

    const site = row.site;
    if (!site?.name) continue;

    const address = [
      site.address_line_1,
      site.address_line_2,
      site.city,
      site.state,
      site.zip_code,
    ]
      .filter(Boolean)
      .join(", ");

    locations.push(address ? `${site.name} (${address})` : site.name);
  }

  for (const row of alertAreas) {
    const locations = locationMap.get(row.alert_id);
    if (!locations) continue;

    const area = row.area;
    if (!area?.name) continue;

    const siteName = siteNameById.get(area.site_id);
    locations.push(siteName ? `${siteName} â€” ${area.name}` : area.name);
  }

  return locationMap;
}
