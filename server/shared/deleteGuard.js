/**
 * Global Delete Protection Middleware
 * Allows `super_admin` (System Owner) and Main Warehouse administrators / warehouse managers to execute DELETE operations.
 */

const { requireAuth } = require('./authMiddleware');

function isAuthorizedToDelete(user) {
  if (!user) return false;
  if (user.role === 'super_admin') return true;
  if (user.role === 'admin') return true;
  if (user.role === 'warehouse_manager') return true;
  if (user.isMainWarehouse === true) return true;
  if (user.branchType === 'main_warehouse') return true;
  if (user.branchId === 1 || user.branch_id === 1) return true;
  if (user.branchCode === 'BR-MAIN' || user.branchCode === 'MAIN') return true;
  if (user.username === 'main' || user.username === 'main-1234') return true;
  return false;
}

function deleteGuard(req, res, next) {
  if (req.method === 'DELETE') {
    // If user is not yet authenticated by a route-level middleware, run requireAuth first
    if (!req.user) {
      return requireAuth(req, res, () => {
        if (!req.user || !isAuthorizedToDelete(req.user)) {
          return res.status(403).json({
            success: false,
            code: 'DELETE_FORBIDDEN',
            message: 'صلاحية الحذف مقتصرة حصرياً على مدير عام النظام (Owner) وإدارة المستودع الرئيسي فقط.'
          });
        }
        next();
      });
    }

    if (!isAuthorizedToDelete(req.user)) {
      return res.status(403).json({
        success: false,
        code: 'DELETE_FORBIDDEN',
        message: 'صلاحية الحذف مقتصرة حصرياً على مدير عام النظام (Owner) وإدارة المستودع الرئيسي فقط.'
      });
    }
  }
  next();
}

module.exports = deleteGuard;
