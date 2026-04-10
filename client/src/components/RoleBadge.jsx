const ROLE_CONFIG = {
  owner:  { label: 'Owner',  className: 'bg-purple-900/60 text-purple-300 border border-purple-700/50' },
  admin:  { label: 'Admin',  className: 'bg-blue-900/60 text-blue-300 border border-blue-700/50' },
  member: { label: 'Member', className: 'bg-gray-800 text-gray-300 border border-gray-700' },
  viewer: { label: 'Viewer', className: 'bg-gray-900 text-gray-500 border border-gray-800' },
};

export default function RoleBadge({ role }) {
  const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.viewer;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
