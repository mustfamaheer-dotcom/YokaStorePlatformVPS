/**
 * Central Client-Side Permissions Helper
 * Enforces Owner & Main Warehouse permissions across UI screens.
 */

export const isOwner = (user) => Boolean(
  user?.role === 'super_admin' ||
  user?.role === 'owner'
);

export const isMainWarehouse = (user) => Boolean(
  user?.isMainWarehouse === true ||
  user?.branchType === 'main_warehouse' ||
  user?.branchId === 1 ||
  user?.branch_id === 1 ||
  user?.branchCode === 'BR-MAIN' ||
  user?.branch_code === 'BR-MAIN' ||
  user?.branchCode === 'MAIN' ||
  user?.branch_code === 'MAIN' ||
  user?.username === 'main' ||
  user?.username === 'main-1234' ||
  user?.role === 'warehouse_manager' ||
  user?.role === 'admin'
);

export const canDelete = (user) => Boolean(isOwner(user) || isMainWarehouse(user));

export const canDeleteProduct = (user) => Boolean(isOwner(user) || isMainWarehouse(user));
