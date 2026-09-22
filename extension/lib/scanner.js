// Mirrors src/scanner.js; kept as an ES module because the extension has no bundler.
const AVAILABLE = new Set(['AVAILABLE', 'READY', 'IDLE', 'OPERATIVE']);

const up = (value) => (typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '_') : null);

function locationsArray(root) {
  if (Array.isArray(root)) return root;
  for (const key of ['locations', 'data', 'content', 'results']) {
    if (Array.isArray(root?.[key])) return root[key];
  }
  return [];
}

export function scan(root) {
  const connectors = [];
  for (const location of locationsArray(root)) {
    if (!Array.isArray(location?.ports)) continue;
    const locationName =
      location.locationName || location.organizationName || location.address || 'Unknown location';

    for (const port of location.ports) {
      const list = Array.isArray(port?.connectors) && port.connectors.length ? port.connectors : [null];
      const qrCode = port?.qrCode ? String(port.qrCode) : null;
      const portLabel = qrCode ? `QR ${qrCode}` : `Station ${String(port?.portId ?? '').slice(0, 8)}`;

      for (const connector of list) {
        // serviceStatus is what matches availableConnectorsCountByServiceStatus,
        // so a connector only counts as free when both status fields agree.
        const connectorStatus = up(connector?.connectorStatus);
        const serviceStatus = up(connector?.serviceStatus);
        const portStatus = up(port?.status);
        const checks = [connectorStatus, serviceStatus].filter(Boolean);

        const suffix = list.length > 1 && connector?.connectorName ? ` (${connector.connectorName})` : '';
        connectors.push({
          id: connector?.externalId || `${port?.portId ?? portLabel}:${connector?.connectorId ?? 0}`,
          label: `${portLabel}${suffix} — ${locationName}`,
          qrCode,
          location: locationName,
          status: serviceStatus || connectorStatus || portStatus || 'UNKNOWN',
          powerLevel: port?.powerLevel ?? null,
          available: checks.length
            ? checks.every((status) => AVAILABLE.has(status))
            : AVAILABLE.has(portStatus),
        });
      }
    }
  }
  return connectors.sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
}
