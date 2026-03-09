export const buildRecipientUsers = (recipients, latestLocations) => {
  const latestByUserId = new Map(
    (latestLocations || []).map((location) => [location.user_id, location]),
  );

  return (recipients || []).map((recipient) => {
    const user = recipient.user;
    const location = latestByUserId.get(recipient.user_id) || null;

    let contractor_company = null;
    if (
      user?.user_type === "contractor" &&
      Array.isArray(user.contractors) &&
      user.contractors.length > 0
    ) {
      const contractingCompany = user.contractors[0]?.contracting_company;
      if (contractingCompany) {
        contractor_company = {
          company_id: contractingCompany.id,
          company_name: contractingCompany.name,
        };
      }
    }

    return {
      user_id: recipient.user_id,
      user_name: `${user?.first_name ?? ""} ${user?.last_name ?? ""}`.trim(),
      user_type: user?.user_type ?? null,
      contractor_company,
      site: user?.site ? { site_id: user.site.id, site_name: user.site.name } : null,
      area: user?.area ? { area_id: user.area.id, area_name: user.area.name } : null,
      response: recipient.response ?? null,
      response_updated_at: recipient.response_updated_at ?? null,
      acknowledged_at: recipient.acknowledged_at ?? null,
      delivery_status: recipient.delivery_status,
      delivered_at: recipient.delivered_at ?? null,
      latest_location: location
        ? {
            latitude: location.latitude,
            longitude: location.longitude,
            location_name: location.location_name ?? null,
            timestamp: location.timestamp,
          }
        : null,
    };
  });
};

export const summarizeRecipientResponses = (users) => {
  const safeUsers = users || [];

  return {
    total_employees_count: safeUsers.filter(
      (user) => user.user_type === "employee" || user.user_type === "contractor",
    ).length,
    safe_count: safeUsers.filter((user) => user.response === "safe").length,
    need_help_count: safeUsers.filter((user) => user.response === "need_help").length,
    emergency_help_needed_count: safeUsers.filter(
      (user) => user.response === "emergency_help_needed",
    ).length,
    not_responded_count: safeUsers.filter((user) => user.response == null).length,
  };
};

export const buildAlertDetailComputedFields = (alert) => {
  const startDt = alert.start_time ?? alert.scheduled_time ?? alert.created_at;
  const endDt = alert.end_time ?? null;

  let elapsed_time = null;
  if (startDt) {
    const endForCalc = endDt ?? (alert.status === "active" ? new Date() : null);
    if (endForCalc) {
      elapsed_time = Math.max(
        0,
        Math.floor((endForCalc.getTime() - startDt.getTime()) / 1000),
      );
    }
  }

  const sites = (alert.Alert_Sites ?? [])
    .map((entry) => entry.site)
    .filter(Boolean)
    .map((site) => ({ site_id: site.id, site_name: site.name }));

  const created_by = alert.user
    ? {
        user_id: alert.user.user_id,
        user_name: `${alert.user.first_name ?? ""} ${alert.user.last_name ?? ""}`.trim(),
      }
    : null;

  return { startDt, endDt, elapsed_time, sites, created_by };
};
