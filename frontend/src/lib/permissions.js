export const hasPermission = (user, permission) => {
  if (!user?.permissions) return false;
  return user.permissions.includes("*") || user.permissions.includes(permission);
};

export const canAccessAny = (user, permissions) => permissions.some((permission) => hasPermission(user, permission));
