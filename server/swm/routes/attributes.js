const router = require('express').Router();
const { query } = require('../../shared/db');
const { requireAuth, requireRole, requireWarehousePermission } = require('../../shared/authMiddleware');
const { logActivity } = require('../../shared/activityLogger');

router.use(requireWarehousePermission('groups_items'));

/**
 * GET /api/swm/attributes/analytics
 * Comprehensive stats for colors and sizes in warehouse inventory
 */
router.get('/analytics', requireAuth, async (req, res) => {
  try {
    const stats = await query(`
      SELECT
        COUNT(*) FILTER (WHERE attribute_type = 'color')::int AS total_colors,
        COUNT(*) FILTER (WHERE attribute_type = 'color' AND status = 'active')::int AS active_colors,
        COUNT(*) FILTER (WHERE attribute_type = 'color' AND status = 'inactive')::int AS inactive_colors,
        COUNT(*) FILTER (WHERE attribute_type = 'size')::int AS total_sizes,
        COUNT(*) FILTER (WHERE attribute_type = 'size' AND status = 'active')::int AS active_sizes,
        COUNT(*) FILTER (WHERE attribute_type = 'size' AND status = 'inactive')::int AS inactive_sizes
      FROM product_attributes
    `);

    const topColors = await query(`
      SELECT pv.color AS name, COUNT(*)::int AS count
      FROM product_variants pv
      WHERE pv.color IS NOT NULL AND TRIM(pv.color) != '' AND pv.status != 'archived'
      GROUP BY pv.color
      ORDER BY count DESC
      LIMIT 10
    `);

    const topSizes = await query(`
      SELECT pv.size AS name, COUNT(*)::int AS count
      FROM product_variants pv
      WHERE pv.size IS NOT NULL AND TRIM(pv.size) != '' AND pv.status != 'archived'
      GROUP BY pv.size
      ORDER BY count DESC
      LIMIT 10
    `);

    return res.json({
      success: true,
      data: {
        overview: stats[0] || {},
        topColors,
        topSizes
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/swm/attributes/batch
 * Add multiple sizes or colors in one operation
 */
router.post('/batch', requireAuth, requireRole(['super_admin', 'admin', 'content_manager', 'inventory_manager', 'warehouse_manager']), async (req, res) => {
  try {
    const { attribute_type, items } = req.body;
    if (!attribute_type || !['size', 'color'].includes(attribute_type.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'نوع الخاصية يجب أن يكون size أو color' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'قائمة العناصر مطلوبة' });
    }

    const cleanType = attribute_type.toLowerCase();
    let addedCount = 0;
    let skippedCount = 0;
    const addedItems = [];

    for (const item of items) {
      const name = item.name ? item.name.trim() : '';
      if (!name) continue;

      const existing = await query(
        `SELECT id FROM product_attributes WHERE attribute_type = $1 AND LOWER(name) = LOWER($2)`,
        [cleanType, name]
      );

      if (existing.length > 0) {
        skippedCount++;
        continue;
      }

      const inserted = await query(
        `INSERT INTO product_attributes (attribute_type, name, code, display_order, status, created_at, updated_at)
         VALUES ($1, $2, $3, COALESCE($4, 0), 'active', NOW(), NOW())
         RETURNING *`,
        [cleanType, name, item.code ? item.code.trim() : null, item.display_order || 0]
      );

      if (inserted.length > 0) {
        addedCount++;
        addedItems.push(inserted[0]);
      }
    }

    logActivity({
      userId: req.user.id,
      branchId: req.user.branchId,
      actionType: 'BATCH_CREATE_ATTRIBUTES',
      entityType: 'product_attributes',
      newValue: { count: addedCount, type: cleanType },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      notes: `Batch added ${addedCount} ${cleanType} attributes`
    });

    return res.status(201).json({
      success: true,
      message: `تمت إضافة ${addedCount} عنصر بنجاح (تم تخطي ${skippedCount} مكرر)`,
      data: { addedCount, skippedCount, addedItems }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/swm/attributes/reorder
 * Update display orders for multiple attributes
 */
router.put('/reorder', requireAuth, requireRole(['super_admin', 'admin', 'content_manager', 'warehouse_manager']), async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'قائمة الترتيب مطلوبة' });
    }

    for (const item of items) {
      if (item.id && typeof item.display_order === 'number') {
        await query(
          `UPDATE product_attributes SET display_order = $1, updated_at = NOW() WHERE id = $2`,
          [item.display_order, item.id]
        );
      }
    }

    return res.json({ success: true, message: 'تم تحديث الترتيب بنجاح' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/swm/attributes
 * Fetch sizes and/or colors with optional variant usage counts
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const { type, status, q } = req.query;
    const whereClauses = [];
    const params = [];
    let pIdx = 1;

    if (type) {
      whereClauses.push(`a.attribute_type = $${pIdx}`);
      params.push(type.toLowerCase());
      pIdx++;
    }

    if (status) {
      whereClauses.push(`a.status = $${pIdx}`);
      params.push(status.toLowerCase());
      pIdx++;
    }

    if (q && q.trim()) {
      whereClauses.push(`(a.name ILIKE $${pIdx} OR a.code ILIKE $${pIdx})`);
      params.push(`%${q.trim()}%`);
      pIdx++;
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const attributes = await query(
      `SELECT a.*,
         CASE WHEN a.attribute_type = 'color' THEN
           (SELECT COUNT(*)::int FROM product_variants pv WHERE LOWER(pv.color) = LOWER(a.name) AND pv.status != 'archived')
         ELSE
           (SELECT COUNT(*)::int FROM product_variants pv WHERE LOWER(pv.size) = LOWER(a.name) AND pv.status != 'archived')
         END AS usage_count
       FROM product_attributes a
       ${whereSql}
       ORDER BY a.display_order ASC, a.id ASC`,
      params
    );

    return res.json({ success: true, data: attributes });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/swm/attributes
 * Add new size or color
 */
router.post('/', requireAuth, requireRole(['super_admin', 'admin', 'content_manager', 'inventory_manager', 'warehouse_manager']), async (req, res) => {
  try {
    const { attribute_type, name, code, display_order } = req.body;
    if (!attribute_type || !['size', 'color'].includes(attribute_type.toLowerCase())) {
      return res.status(400).json({ success: false, message: 'نوع الخاصية يجب أن يكون size أو color' });
    }

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'اسم المقاس أو اللون مطلوب' });
    }

    const cleanName = name.trim();
    const cleanType = attribute_type.toLowerCase();

    // Check for duplicate
    const existing = await query(
      `SELECT id FROM product_attributes WHERE attribute_type = $1 AND LOWER(name) = LOWER($2)`,
      [cleanType, cleanName]
    );

    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: `هذا الـ (${cleanType === 'size' ? 'المقاس' : 'اللون'}) مسجل بالفعل مسبقاً` });
    }

    const rows = await query(
      `INSERT INTO product_attributes (attribute_type, name, code, display_order, status, created_at, updated_at)
       VALUES ($1, $2, $3, COALESCE($4, 0), 'active', NOW(), NOW())
       RETURNING *`,
      [cleanType, cleanName, code ? code.trim() : null, display_order || 0]
    );

    const newAttr = rows[0];

    logActivity({
      userId: req.user.id,
      branchId: req.user.branchId,
      actionType: 'CREATE_ATTRIBUTE',
      entityType: 'product_attributes',
      entityId: newAttr.id,
      newValue: newAttr,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      notes: `Added new ${cleanType}: ${cleanName}`
    });

    return res.status(201).json({ success: true, data: newAttr });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * PUT /api/swm/attributes/:id
 * Update size or color
 */
router.put('/:id', requireAuth, requireRole(['super_admin', 'admin', 'content_manager', 'warehouse_manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, display_order, status, sync_variants } = req.body;

    const [old] = await query(`SELECT * FROM product_attributes WHERE id = $1`, [id]);
    if (!old) {
      return res.status(404).json({ success: false, message: 'الخاصية غير موجودة' });
    }

    const cleanName = name ? name.trim() : null;

    // If name is changing, check for uniqueness collision
    if (cleanName && cleanName.toLowerCase() !== old.name.toLowerCase()) {
      const dup = await query(
        `SELECT id FROM product_attributes WHERE attribute_type = $1 AND LOWER(name) = LOWER($2) AND id != $3`,
        [old.attribute_type, cleanName, id]
      );
      if (dup.length > 0) {
        return res.status(409).json({ success: false, message: `الاسم "${cleanName}" مسجل بالفعل مسبقاً` });
      }
    }

    const updatedRows = await query(
      `UPDATE product_attributes
       SET name = COALESCE($1, name),
           code = COALESCE($2, code),
           display_order = COALESCE($3, display_order),
           status = COALESCE($4, status),
           updated_at = NOW()
       WHERE id = $5
       RETURNING *`,
      [
        cleanName,
        code !== undefined ? (code ? code.trim() : null) : null,
        display_order !== undefined ? parseInt(display_order, 10) : null,
        status || null,
        id
      ]
    );

    const updatedAttr = updatedRows[0];

    // Optionally synchronize product variants if name changed
    if (sync_variants && cleanName && cleanName !== old.name) {
      if (old.attribute_type === 'color') {
        await query(
          `UPDATE product_variants SET color = $1 WHERE LOWER(color) = LOWER($2)`,
          [cleanName, old.name]
        );
      } else {
        await query(
          `UPDATE product_variants SET size = $1 WHERE LOWER(size) = LOWER($2)`,
          [cleanName, old.name]
        );
      }
    }

    logActivity({
      userId: req.user.id,
      branchId: req.user.branchId,
      actionType: 'UPDATE_ATTRIBUTE',
      entityType: 'product_attributes',
      entityId: id,
      oldValue: old,
      newValue: req.body,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    return res.json({ success: true, message: 'تم تحديث الخاصية بنجاح', data: updatedAttr });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * DELETE /api/swm/attributes/:id
 * Delete size or color (with variant usage protection)
 */
router.delete('/:id', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const { id } = req.params;
    const { force } = req.query;

    const [attr] = await query(`SELECT * FROM product_attributes WHERE id = $1`, [id]);
    if (!attr) {
      return res.status(404).json({ success: false, message: 'الخاصية غير موجودة' });
    }

    // Safety check against linked inventory variants
    const countRes = await query(
      attr.attribute_type === 'color'
        ? `SELECT COUNT(*)::int AS count FROM product_variants WHERE LOWER(color) = LOWER($1) AND status != 'archived'`
        : `SELECT COUNT(*)::int AS count FROM product_variants WHERE LOWER(size) = LOWER($1) AND status != 'archived'`,
      [attr.name]
    );
    const usageCount = countRes[0]?.count || 0;

    if (usageCount > 0 && force !== 'true') {
      return res.status(400).json({
        success: false,
        has_usage: true,
        usage_count: usageCount,
        message: `لا يمكن حذف هذا الـ (${attr.attribute_type === 'size' ? 'المقاس' : 'اللون'}) لأنه مستخدم في ${usageCount} صنف بمخازن النظام. يمكنك تعطيله بدلاً من حذفه.`
      });
    }

    await query(`DELETE FROM product_attributes WHERE id = $1`, [id]);

    logActivity({
      userId: req.user.id,
      branchId: req.user.branchId,
      actionType: 'DELETE_ATTRIBUTE',
      entityType: 'product_attributes',
      entityId: id,
      oldValue: attr,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      notes: `Deleted ${attr.attribute_type}: ${attr.name}`
    });

    return res.json({ success: true, message: 'تم الحذف بنجاح' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
