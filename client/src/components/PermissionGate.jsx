import { usePermissions } from '../hooks/usePermissions.js';

/**
 * Renders children only when the user has access.
 *
 * Props:
 *   screen    — check if user can access a named screen ("settings", "team", …)
 *   role      — check if user has one of these exact roles (string or string[])
 *   minRole   — check if user role is at or above this level
 *   fallback  — what to render when access is denied (default: null)
 */
export default function PermissionGate({ screen, role, minRole, fallback = null, children }) {
  const { canAccess, hasRole, hasMinRole } = usePermissions();

  let allowed = true;

  if (screen   !== undefined && !canAccess(screen)) allowed = false;
  if (role     !== undefined && !hasRole(...(Array.isArray(role) ? role : [role]))) allowed = false;
  if (minRole  !== undefined && !hasMinRole(minRole)) allowed = false;

  return allowed ? children : fallback;
}
