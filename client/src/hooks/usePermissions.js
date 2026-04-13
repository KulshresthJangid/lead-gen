import { useAuth } from '../context/AuthContext.jsx';

// Role hierarchy: owner > admin > member > viewer
const ROLE_ORDER = { owner: 4, admin: 3, member: 2, viewer: 1 };

// Default screen access by role
const SCREEN_DEFAULTS = {
  dashboard:  ['owner', 'admin', 'member', 'viewer'],
  campaigns:  ['owner', 'admin', 'member', 'viewer'],
  analytics:  ['owner', 'admin', 'member'],
  outreach:   ['owner', 'admin', 'member'],
  'ai-logs':  ['owner', 'admin'],
  settings:   ['owner', 'admin'],
  team:       ['owner', 'admin'],
};

export function usePermissions() {
  const { user } = useAuth();

  const role = user?.role || 'viewer';
  const roleLevel = ROLE_ORDER[role] || 0;
  const screenPermissions = user?.screenPermissions || {};

  function canAccess(screen) {
    // Explicit per-user override takes precedence
    if (screen in screenPermissions) return screenPermissions[screen];
    // Otherwise use role-based defaults
    const allowed = SCREEN_DEFAULTS[screen] || [];
    return allowed.includes(role);
  }

  function hasRole(...roles) {
    return roles.includes(role);
  }

  function hasMinRole(minRole) {
    return roleLevel >= (ROLE_ORDER[minRole] || 0);
  }

  return { role, canAccess, hasRole, hasMinRole, screenPermissions, user };
}
