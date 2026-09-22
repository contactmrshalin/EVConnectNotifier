// Primary parser targets the observed /users/current/locations shape:
//   [{ locationName, ports: [{ portId, qrCode, status,
//      connectors: [{ externalId, connectorName, connectorStatus, serviceStatus }] }] }]
// The generic walker below stays as a fallback if that shape ever changes.
const AVAILABLE = new Set(['AVAILABLE', 'READY', 'IDLE', 'OPERATIVE']);

const KNOWN_STATUSES = new Set([
  ...AVAILABLE,
  'IN_USE', 'INUSE', 'OCCUPIED', 'CHARGING', 'PREPARING', 'FINISHING', 'SUSPENDED',
  'RESERVED', 'OFFLINE', 'UNAVAILABLE', 'OUT_OF_SERVICE', 'OUTOFSERVICE', 'FAULTED',
  'FAULT', 'INOPERATIVE', 'IN_MAINTENANCE', 'DISABLED', 'UNKNOWN', 'PLUGGED_IN',
]);

const ID_KEYS = ['externalId', 'portId', 'connectorId', 'evseId', 'stationPortId', 'id', 'uid'];
const STATUS_KEYS = ['serviceStatus', 'connectorStatus', 'portStatus', 'status', 'chargingStatus', 'state'];
const NAME_KEYS = ['locationName', 'name', 'displayName', 'label', 'qrCode', 'connectorName', 'address'];

const up = (value) =>
  typeof value === 'string' ? value.toUpperCase().replace(/\s+/g, '_') : null;

function locationsArray(root) {
  if (Array.isArray(root)) return root;
  for (const key of ['locations', 'data', 'content', 'results']) {
    if (Array.isArray(root?.[key])) return root[key];
  }
  return null;
}

function parseLocations(root) {
  const locations = locationsArray(root);
  if (!locations || !locations.some((location) => Array.isArray(location?.ports))) return null;

  const connectors = [];
  for (const location of locations) {
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
  return connectors.length ? connectors : null;
}

function firstString(node, keys) {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number') return String(value);
  }
  return null;
}

function walk(node, path, context, found) {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walk(item, `${path}[${index}]`, context, found));
    return;
  }
  if (!node || typeof node !== 'object') return;

  const name = firstString(node, NAME_KEYS);
  const nextContext = name ? [...context, name] : context;

  const status = up(firstString(node, STATUS_KEYS));
  if (status && KNOWN_STATUSES.has(status)) {
    const id = `${path}:${firstString(node, ID_KEYS) ?? ''}`;
    const label = nextContext.slice(-2).join(' › ') || id;
    found.set(id, {
      id,
      label,
      qrCode: null,
      location: nextContext[0] ?? '',
      status,
      powerLevel: null,
      available: AVAILABLE.has(status),
    });
  }

  for (const [key, value] of Object.entries(node)) {
    walk(value, `${path}.${key}`, nextContext, found);
  }
}

function scan(root) {
  const byLabel = (a, b) => a.label.localeCompare(b.label, undefined, { numeric: true });
  const parsed = parseLocations(root);
  if (parsed) return parsed.sort(byLabel);

  const found = new Map();
  walk(root, '$', [], found);
  return [...found.values()].sort(byLabel);
}

module.exports = { scan };
