const router = require('express').Router();
const { query, transaction } = require('../../shared/db');
const { requireAuth, requireRole, requireWarehousePermission } = require('../../shared/authMiddleware');
const { logActivity } = require('../../shared/activityLogger');

router.use(requireWarehousePermission('transfers'));

/**
 * GET /api/swm/transfers/metrics
 * Summary stats of stock transfers
 */
router.get('/metrics', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const [stats] = await query(`
      SELECT
        COUNT(id) AS total_transfers,
        COALESCE(SUM(total_units), 0) AS total_units_dispatched,
        COUNT(DISTINCT from_branch_id) AS sender_branches_count,
        COUNT(DISTINCT to_branch_id) AS receiver_branches_count
      FROM stock_transfers
    `);

    return res.json({
      success: true,
      data: {
        total_transfers: parseInt(stats?.total_transfers || 0, 10),
        total_units_dispatched: parseInt(stats?.total_units_dispatched || 0, 10),
        sender_branches_count: parseInt(stats?.sender_branches_count || 0, 10),
        receiver_branches_count: parseInt(stats?.receiver_branches_count || 0, 10)
      }
    });
  } catch (err) {
    console.error('Transfers metrics error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/swm/transfers/branch-stock/:branchId
 * Get available products with current stock in the specified sending branch
 */
router.get('/branch-stock/:branchId', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const { branchId } = req.params;
    const { search } = req.query;

    const whereClauses = ['ib.branch_id = $1', 'ib.available_qty > 0', 'p.status = \'active\''];
    const params = [parseInt(branchId, 10)];
    let pIdx = 2;

    if (search && search.trim()) {
      let clean = search.trim();
      if (/^\d{26}$/.test(clean) && clean.slice(0, 13) === clean.slice(13)) {
        clean = clean.slice(0, 13);
      } else if (/^\d{24}$/.test(clean) && clean.slice(0, 12) === clean.slice(12)) {
        clean = clean.slice(0, 12);
      }
      whereClauses.push(`(
        p.product_name ILIKE $${pIdx}
        OR p.product_code ILIKE $${pIdx}
        OR p.barcode ILIKE $${pIdx}
        OR pv.barcode ILIKE $${pIdx}
        OR pv.variant_sku ILIKE $${pIdx}
      )`);
      params.push(`%${clean}%`);
      pIdx++;
    }

    const { category_id } = req.query;
    if (category_id && category_id !== 'all') {
      whereClauses.push(`p.category_id = $${pIdx}`);
      params.push(parseInt(category_id, 10));
      pIdx++;
    }

    const sql = `
      SELECT
        ib.id AS balance_id,
        ib.product_id,
        ib.variant_id,
        ib.available_qty,
        p.product_name,
        p.product_code,
        COALESCE(pv.barcode, p.barcode) AS barcode,
        p.barcode AS product_barcode,
        pv.barcode AS variant_barcode,
        p.cost_price,
        p.selling_price,
        pv.variant_sku,
        pv.color,
        pv.size,
        COALESCE(pv.image_url, p.featured_image) AS image_url,
        p.category_id,
        c.category_name,
        CASE
          WHEN pv.id IS NOT NULL THEN CONCAT(p.product_name, ' (', COALESCE(pv.color, ''), ' - ', COALESCE(pv.size, ''), ')')
          ELSE p.product_name
        END AS display_name
      FROM inventory_balances ib
      JOIN products p ON p.id = ib.product_id
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN product_variants pv ON pv.id = ib.variant_id
      WHERE ${whereClauses.join(' AND ')}
      ORDER BY p.product_name ASC
      LIMIT 1000
    `;

    const rows = await query(sql, params);
    return res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Fetch branch stock error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/swm/transfers/lookup-barcode
 * Lookup a product/variant by barcode across the system, checking stock in the sending branch
 */
router.get('/lookup-barcode', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const { code, from_branch_id } = req.query;
    if (!code || !code.trim()) {
      return res.status(400).json({ success: false, message: 'الكود مطلوب' });
    }

    let clean = code.trim();
    if (/^\d{26}$/.test(clean) && clean.slice(0, 13) === clean.slice(13)) {
      clean = clean.slice(0, 13);
    } else if (/^\d{24}$/.test(clean) && clean.slice(0, 12) === clean.slice(12)) {
      clean = clean.slice(0, 12);
    }

    const branchId = parseInt(from_branch_id, 10) || null;

    // Search for product and variant
    const matchedItems = await query(`
      SELECT
        p.id AS product_id,
        pv.id AS variant_id,
        p.product_name,
        p.product_code,
        p.cost_price,
        p.selling_price,
        p.category_id,
        c.category_name,
        COALESCE(pv.barcode, p.barcode) AS barcode,
        p.barcode AS product_barcode,
        pv.barcode AS variant_barcode,
        pv.variant_sku,
        pv.color,
        pv.size,
        COALESCE(pv.image_url, p.featured_image) AS image_url,
        CASE
          WHEN pv.id IS NOT NULL THEN CONCAT(p.product_name, ' (', COALESCE(pv.color, ''), ' - ', COALESCE(pv.size, ''), ')')
          ELSE p.product_name
        END AS display_name,
        COALESCE(ib.available_qty, 0) AS available_qty,
        ib.id AS balance_id
      FROM products p
      LEFT JOIN product_variants pv ON pv.product_id = p.id
      LEFT JOIN product_categories c ON c.id = p.category_id
      LEFT JOIN inventory_balances ib ON ib.product_id = p.id
        AND (ib.variant_id = pv.id OR (ib.variant_id IS NULL AND pv.id IS NULL))
        AND ib.branch_id = $1
      WHERE p.status = 'active'
        AND (
          pv.barcode = $2
          OR p.barcode = $2
          OR pv.variant_sku = $2
          OR p.product_code = $2
          OR LOWER(pv.barcode) = LOWER($2)
          OR LOWER(p.barcode) = LOWER($2)
          OR LOWER(pv.variant_sku) = LOWER($2)
          OR LOWER(p.product_code) = LOWER($2)
        )
      LIMIT 1
    `, [branchId, clean]);

    if (matchedItems.length === 0) {
      return res.json({
        success: true,
        data: null,
        exists: false,
        message: 'الصنف غير مسجل بالنظام'
      });
    }

    const item = matchedItems[0];

    // If available_qty is 0, fetch other branches where stock exists
    let otherBranches = [];
    if (parseFloat(item.available_qty || 0) <= 0) {
      otherBranches = await query(`
        SELECT b.id, b.branch_name, ib.available_qty
        FROM inventory_balances ib
        JOIN branches b ON b.id = ib.branch_id
        WHERE ib.product_id = $1
          AND (ib.variant_id = $2 OR (ib.variant_id IS NULL AND $2 IS NULL))
          AND ib.available_qty > 0
        ORDER BY ib.available_qty DESC
      `, [item.product_id, item.variant_id || null]);
    }

    return res.json({
      success: true,
      exists: true,
      data: item,
      otherBranches
    });
  } catch (err) {
    console.error('Lookup barcode error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});


/**
 * GET /api/swm/transfers
 * List stock transfers with filters and pagination
 */
router.get('/', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const { from_branch_id, to_branch_id, date, search, page = 1, limit = 5000 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(10000, parseInt(limit, 10) || 5000));
    const offset = (pageNum - 1) * limitNum;

    const whereClauses = ['1=1'];
    const params = [];
    let pIdx = 1;

    if (from_branch_id) {
      whereClauses.push(`st.from_branch_id = $${pIdx++}`);
      params.push(parseInt(from_branch_id, 10));
    }

    if (to_branch_id) {
      whereClauses.push(`st.to_branch_id = $${pIdx++}`);
      params.push(parseInt(to_branch_id, 10));
    }

    if (date) {
      whereClauses.push(`DATE(st.transfer_date) = $${pIdx++}`);
      params.push(date);
    }

    if (search && search.trim()) {
      whereClauses.push(`(st.transfer_number ILIKE $${pIdx} OR st.driver_name ILIKE $${pIdx} OR st.notes ILIKE $${pIdx})`);
      params.push(`%${search.trim()}%`);
      pIdx++;
    }

    const whereSql = `WHERE ${whereClauses.join(' AND ')}`;

    // Total count
    const [countRes] = await query(`SELECT COUNT(st.id) AS total FROM stock_transfers st ${whereSql}`, params);
    const total = parseInt(countRes?.total || 0, 10);

    // Data query
    const sql = `
      SELECT
        st.*,
        fb.branch_name AS from_branch_name,
        fb.branch_code AS from_branch_code,
        fb.branch_type AS from_branch_type,
        tb.branch_name AS to_branch_name,
        tb.branch_code AS to_branch_code,
        tb.branch_type AS to_branch_type,
        u.full_name AS created_by_name,
        u.username AS created_by_username
      FROM stock_transfers st
      JOIN branches fb ON fb.id = st.from_branch_id
      JOIN branches tb ON tb.id = st.to_branch_id
      LEFT JOIN users u ON u.id = st.created_by
      ${whereSql}
      ORDER BY st.transfer_date DESC, st.id DESC
      LIMIT ${limitNum} OFFSET ${offset}
    `;

    const transfers = await query(sql, params);

    return res.json({
      success: true,
      data: transfers,
      meta: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum)
      }
    });
  } catch (err) {
    console.error('List transfers error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * GET /api/swm/transfers/:id
 * Retrieve single dispatch note with line items and branch contacts for PDF/Print
 */
router.get('/:id', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const { id } = req.params;

    const [transfer] = await query(
      `SELECT
        st.*,
        fb.branch_name AS from_branch_name,
        fb.branch_code AS from_branch_code,
        fb.branch_type AS from_branch_type,
        fb.address AS from_branch_address,
        fb.phone AS from_branch_phone,
        tb.branch_name AS to_branch_name,
        tb.branch_code AS to_branch_code,
        tb.branch_type AS to_branch_type,
        tb.address AS to_branch_address,
        tb.phone AS to_branch_phone,
        u.full_name AS created_by_name,
        u.username AS created_by_username
      FROM stock_transfers st
      JOIN branches fb ON fb.id = st.from_branch_id
      JOIN branches tb ON tb.id = st.to_branch_id
      LEFT JOIN users u ON u.id = st.created_by
      WHERE (st.id::text = $1 OR st.transfer_number = $1)`,
      [id]
    );

    if (!transfer) {
      return res.status(404).json({ success: false, message: 'إذن الصرف غير موجود' });
    }

    const items = await query(
      `SELECT
        sti.*,
        p.barcode,
        p.product_code AS master_product_code,
        pv.variant_sku,
        pv.color,
        pv.size
      FROM stock_transfer_items sti
      JOIN products p ON p.id = sti.product_id
      LEFT JOIN product_variants pv ON pv.id = sti.variant_id
      WHERE sti.transfer_id = $1
      ORDER BY sti.id ASC`,
      [transfer.id]
    );

    return res.json({
      success: true,
      data: {
        ...transfer,
        items
      }
    });
  } catch (err) {
    console.error('Transfer details error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
});

/**
 * POST /api/swm/transfers
 * Create and execute stock transfer:
 * - Deducts from sender branch inventory_balances
 * - Adds to receiver branch inventory_balances
 * - Logs transfer_out and transfer_in audit records in inventory_movements
 * - Creates stock_transfers and stock_transfer_items records
 */
router.post('/', requireAuth, requireRole(['super_admin', 'admin', 'warehouse_manager']), async (req, res) => {
  try {
    const {
      from_branch_id,
      to_branch_id,
      transfer_date,
      driver_name,
      vehicle_number,
      notes,
      items
    } = req.body;

    const fromId = parseInt(from_branch_id, 10);
    const toId = parseInt(to_branch_id, 10);

    if (!fromId || !toId) {
      return res.status(400).json({
        success: false,
        message: 'يرجى تحديد كل من المخزن/الفرع المُرسِل والمُستقبِل'
      });
    }

    if (fromId === toId) {
      return res.status(400).json({
        success: false,
        message: 'لا يمكن الصرف لنفس المخزن أو الفرع. يرجى اختيار جهتين مختلفتين.'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'يرجى إضافة صنف واحد على الأقل لإذن الصرف'
      });
    }

    // Verify branches exist and are active
    const branchRows = await query(
      `SELECT id, branch_name, branch_code, status FROM branches WHERE id IN ($1, $2)`,
      [fromId, toId]
    );

    if (branchRows.length < 2) {
      return res.status(400).json({
        success: false,
        message: 'أحد الفروع المحددة غير موجود في النظام'
      });
    }

    const fromBranch = branchRows.find(b => b.id === fromId);
    const toBranch = branchRows.find(b => b.id === toId);

    // Generate unique transfer number: DSP-YYMM-XXXXX
    const yymm = new Date().toISOString().slice(2, 7).replace('-', '');
    const [{ count }] = await query(`SELECT COUNT(id) AS count FROM stock_transfers`);
    const transferNumber = `DSP-${yymm}-${String(parseInt(count, 10) + 1).padStart(5, '0')}`;

    // Execute atomic transfer transaction with high-performance batching
    const result = await transaction(async (client) => {
      // 1. Group & consolidate duplicate items in payload
      const itemMap = new Map();
      for (const raw of items) {
        const pId = parseInt(raw.product_id, 10);
        if (!pId) continue;
        const vId = raw.variant_id ? parseInt(raw.variant_id, 10) : null;
        const qty = parseInt(raw.quantity, 10) || 0;
        if (qty <= 0) {
          throw new Error(`كمية غير صالحة للصنف ${raw.product_name || pId}`);
        }
        const key = `${pId}_${vId || 'null'}`;
        if (itemMap.has(key)) {
          const existing = itemMap.get(key);
          existing.quantity += qty;
          if (raw.notes && !existing.notes?.includes(raw.notes)) {
            existing.notes = existing.notes ? `${existing.notes} | ${raw.notes}` : raw.notes;
          }
        } else {
          itemMap.set(key, {
            product_id: pId,
            variant_id: vId,
            quantity: qty,
            product_name: raw.product_name,
            product_code: raw.product_code,
            notes: raw.notes || null
          });
        }
      }

      const consolidatedItems = Array.from(itemMap.values());
      if (consolidatedItems.length === 0) {
        throw new Error('يرجى إضافة أصناف صالحة لإذن الصرف');
      }

      const productIds = Array.from(new Set(consolidatedItems.map(i => i.product_id)));

      // 2. Batch fetch product info in ONE query
      const prodPlaceholders = productIds.map((_, i) => `$${i + 1}`).join(', ');
      const prodRes = await client.query(
        `SELECT id, product_code, product_name, cost_price FROM products WHERE id IN (${prodPlaceholders})`,
        productIds
      );
      const prodMap = new Map((prodRes.rows || []).map(p => [p.id, p]));

      // 3. Batch lock & fetch available balances in sender branch in ONE query
      const senderBalPlaceholders = productIds.map((_, i) => `$${i + 2}`).join(', ');
      const senderBalRes = await client.query(
        `SELECT * FROM inventory_balances
         WHERE branch_id = $1 AND product_id IN (${senderBalPlaceholders})
         FOR UPDATE`,
        [fromId, ...productIds]
      );
      const senderBalRows = senderBalRes.rows || [];

      // Build sender balance index: `${pId}_${vId}` and fallback `${pId}_null`
      const senderBalMap = new Map();
      for (const row of senderBalRows) {
        senderBalMap.set(`${row.product_id}_${row.variant_id || 'null'}`, row);
      }

      // 4. Validate stock for every item
      let totalUnits = 0;
      const validatedItems = [];

      for (const item of consolidatedItems) {
        const prod = prodMap.get(item.product_id);
        const prodName = prod?.product_name || item.product_name || `صنف #${item.product_id}`;

        // Look for variant balance, or fallback to base product balance
        let balanceRow = senderBalMap.get(`${item.product_id}_${item.variant_id || 'null'}`);
        if (!balanceRow && item.variant_id) {
          balanceRow = senderBalMap.get(`${item.product_id}_null`);
        }

        const available = balanceRow ? parseInt(balanceRow.available_qty, 10) : 0;
        if (available < item.quantity) {
          throw new Error(
            `الرصيد المتاح للصنف "${prodName}" في ${fromBranch.branch_name} (${available} قطعة) غير كافٍ لصرف (${item.quantity} قطعة)`
          );
        }

        totalUnits += item.quantity;
        validatedItems.push({
          product_id: item.product_id,
          variant_id: item.variant_id,
          quantity: item.quantity,
          unit_cost: parseFloat(prod?.cost_price || 0),
          product_name: prod?.product_name || item.product_name,
          product_code: prod?.product_code || item.product_code,
          notes: item.notes || null,
          sender_balance_id: balanceRow.id,
          sender_stock_before: available,
          sender_stock_after: available - item.quantity
        });
      }

      // 5. Insert into stock_transfers header
      const [transfer] = (await client.query(
        `INSERT INTO stock_transfers (
          transfer_number, from_branch_id, to_branch_id, transfer_date,
          status, total_items, total_units, driver_name, vehicle_number,
          notes, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, 'completed', $5, $6, $7, $8, $9, $10, NOW(), NOW())
        RETURNING *`,
        [
          transferNumber,
          fromId,
          toId,
          transfer_date || new Date().toISOString().split('T')[0],
          validatedItems.length,
          totalUnits,
          driver_name || null,
          vehicle_number || null,
          notes || null,
          req.user.id
        ]
      )).rows;

      // 6. Multi-row chunked bulk insert into stock_transfer_items (batches of 100)
      const savedItems = [];
      const CHUNK_SIZE = 100;
      for (let i = 0; i < validatedItems.length; i += CHUNK_SIZE) {
        const chunk = validatedItems.slice(i, i + CHUNK_SIZE);
        const itemValues = [];
        const itemParams = [transfer.id];
        let pIdx = 2;
        for (const v of chunk) {
          itemValues.push(`($1, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, NOW(), NOW())`);
          itemParams.push(
            v.product_id,
            v.variant_id,
            v.quantity,
            v.unit_cost,
            v.product_name,
            v.product_code,
            v.notes
          );
        }

        const chunkSaved = (await client.query(
          `INSERT INTO stock_transfer_items (
            transfer_id, product_id, variant_id, quantity, unit_cost,
            product_name, product_code, notes, created_at, updated_at
          ) VALUES ${itemValues.join(', ')}
          RETURNING *`,
          itemParams
        )).rows || [];
        savedItems.push(...chunkSaved);
      }

      // 7. High-performance batch update for sender balances (consolidated by balance ID)
      const senderBalanceDeductions = new Map();
      for (const v of validatedItems) {
        const cur = senderBalanceDeductions.get(v.sender_balance_id) || 0;
        senderBalanceDeductions.set(v.sender_balance_id, cur + v.quantity);
      }

      const senderEntries = Array.from(senderBalanceDeductions.entries());
      for (let i = 0; i < senderEntries.length; i += CHUNK_SIZE) {
        const batch = senderEntries.slice(i, i + CHUNK_SIZE);
        const caseClauses = [];
        const batchParams = [];
        let bIdx = 1;
        for (const [balId, qty] of batch) {
          caseClauses.push(`WHEN $${bIdx++} THEN $${bIdx++}::int`);
          batchParams.push(balId, qty);
        }
        const idPlaceholders = batch.map((_, idx) => `$${idx * 2 + 1}`).join(', ');
        await client.query(
          `UPDATE inventory_balances
           SET available_qty = available_qty - (CASE id ${caseClauses.join(' ')} END),
               last_movement_at = NOW(),
               last_updated = NOW()
           WHERE id IN (${idPlaceholders})`,
          batchParams
        );
      }

      // 8. Batch lock & fetch receiver branch balances in ONE query
      const receiverBalPlaceholders = productIds.map((_, i) => `$${i + 2}`).join(', ');
      const receiverBalRes = await client.query(
        `SELECT * FROM inventory_balances
         WHERE branch_id = $1 AND product_id IN (${receiverBalPlaceholders})
         FOR UPDATE`,
        [toId, ...productIds]
      );
      const receiverBalRows = receiverBalRes.rows || [];
      const receiverBalMap = new Map();
      for (const row of receiverBalRows) {
        receiverBalMap.set(`${row.product_id}_${row.variant_id || 'null'}`, row);
      }

      // 9. Process receiver additions (bulk update existing + bulk insert new)
      const movementsToInsert = [];

      // Add sender movements (transfer_out)
      for (const v of validatedItems) {
        movementsToInsert.push({
          branch_id: fromId,
          product_id: v.product_id,
          variant_id: v.variant_id,
          movement_type: 'transfer_out',
          quantity_change: -v.quantity,
          quantity_before: v.sender_stock_before,
          quantity_after: v.sender_stock_after,
          reference_type: 'stock_transfers',
          reference_id: transfer.id,
          notes: `إذن صرف #${transferNumber} إلى ${toBranch.branch_name}`,
          created_by: req.user.id
        });
      }

      const existingReceiverAdditions = new Map();
      const newBalancesToInsert = [];

      for (const v of validatedItems) {
        let rRow = receiverBalMap.get(`${v.product_id}_${v.variant_id || 'null'}`);
        if (!rRow && !v.variant_id) {
          rRow = receiverBalMap.get(`${v.product_id}_null`);
        }

        let receiverStockBefore = 0;
        let receiverStockAfter = v.quantity;

        if (rRow) {
          receiverStockBefore = parseInt(rRow.available_qty, 10);
          receiverStockAfter = receiverStockBefore + v.quantity;

          const curAdd = existingReceiverAdditions.get(rRow.id) || 0;
          existingReceiverAdditions.set(rRow.id, curAdd + v.quantity);
          rRow.available_qty = receiverStockAfter;
        } else {
          // Check if already in pending new balances
          const pending = newBalancesToInsert.find(
            (b) => b.product_id === v.product_id && (b.variant_id || null) === (v.variant_id || null)
          );
          if (pending) {
            receiverStockBefore = pending.quantity;
            receiverStockAfter = pending.quantity + v.quantity;
            pending.quantity = receiverStockAfter;
          } else {
            newBalancesToInsert.push({
              branch_id: toId,
              product_id: v.product_id,
              variant_id: v.variant_id,
              quantity: v.quantity
            });
          }
        }

        movementsToInsert.push({
          branch_id: toId,
          product_id: v.product_id,
          variant_id: v.variant_id,
          movement_type: 'transfer_in',
          quantity_change: v.quantity,
          quantity_before: receiverStockBefore,
          quantity_after: receiverStockAfter,
          reference_type: 'stock_transfers',
          reference_id: transfer.id,
          notes: `إذن استلام #${transferNumber} من ${fromBranch.branch_name}`,
          created_by: req.user.id
        });
      }

      // Bulk update existing receiver balances
      const receiverEntries = Array.from(existingReceiverAdditions.entries());
      for (let i = 0; i < receiverEntries.length; i += CHUNK_SIZE) {
        const batch = receiverEntries.slice(i, i + CHUNK_SIZE);
        const caseClauses = [];
        const batchParams = [];
        let bIdx = 1;
        for (const [balId, qty] of batch) {
          caseClauses.push(`WHEN $${bIdx++} THEN $${bIdx++}::int`);
          batchParams.push(balId, qty);
        }
        const idPlaceholders = batch.map((_, idx) => `$${idx * 2 + 1}`).join(', ');
        await client.query(
          `UPDATE inventory_balances
           SET available_qty = available_qty + (CASE id ${caseClauses.join(' ')} END),
               last_movement_at = NOW(),
               last_updated = NOW()
           WHERE id IN (${idPlaceholders})`,
          batchParams
        );
      }

      // Bulk insert new receiver balances if any
      for (let i = 0; i < newBalancesToInsert.length; i += CHUNK_SIZE) {
        const chunk = newBalancesToInsert.slice(i, i + CHUNK_SIZE);
        const bValues = [];
        const bParams = [];
        let bIdx = 1;
        for (const b of chunk) {
          bValues.push(`($${bIdx++}, $${bIdx++}, $${bIdx++}, $${bIdx++}, 0, 0, NOW(), NOW())`);
          bParams.push(b.branch_id, b.product_id, b.variant_id, b.quantity);
        }
        await client.query(
          `INSERT INTO inventory_balances (
            branch_id, product_id, variant_id, available_qty,
            reserved_qty, sold_qty, last_movement_at, last_updated
          ) VALUES ${bValues.join(', ')}`,
          bParams
        );
      }

      // 10. Multi-row chunked bulk insert for ALL inventory movements (batches of 100)
      for (let i = 0; i < movementsToInsert.length; i += CHUNK_SIZE) {
        const chunk = movementsToInsert.slice(i, i + CHUNK_SIZE);
        const mValues = [];
        const mParams = [];
        let mIdx = 1;
        for (const m of chunk) {
          mValues.push(`($${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, $${mIdx++}, NOW(), NOW())`);
          mParams.push(
            m.branch_id,
            m.product_id,
            m.variant_id,
            m.movement_type,
            m.quantity_change,
            m.quantity_before,
            m.quantity_after,
            m.reference_type,
            m.reference_id,
            m.notes,
            m.created_by
          );
        }

        await client.query(
          `INSERT INTO inventory_movements (
            branch_id, product_id, variant_id, movement_type, quantity_change,
            quantity_before, quantity_after, reference_type, reference_id,
            notes, created_by, created_at, updated_at
          ) VALUES ${mValues.join(', ')}`,
          mParams
        );
      }

      return { transfer, items: savedItems };
    });

    logActivity({
      userId: req.user.id,
      userRole: req.user.role,
      userName: req.user.fullName || req.user.username,
      actionUrl: `/swm-admin/dashboard/transfers?id=${result.transfer.id}&code=${transferNumber}`,
      branchId: fromId,
      actionType: 'CREATE_TRANSFER',
      entityType: 'stock_transfers',
      entityId: result.transfer.id,
      newValue: {
        transfer_number: transferNumber,
        from_branch: fromBranch.branch_name,
        to_branch: toBranch.branch_name,
        items_count: items.length,
        total_units: result.transfer.total_units
      },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      notes: `إذن صرف #${transferNumber}: تحويل ${result.transfer.total_units} قطعة من ${fromBranch.branch_name} إلى ${toBranch.branch_name}`
    });

    return res.status(201).json({
      success: true,
      data: {
        ...result.transfer,
        from_branch_name: fromBranch.branch_name,
        to_branch_name: toBranch.branch_name,
        items: result.items
      },
      message: `تم تنفيذ إذن الصرف #${transferNumber} بنجاح وخصم/إضافة الكميات تلقائياً`
    });
  } catch (err) {
    console.error('Create transfer error:', err);
    return res.status(400).json({ success: false, message: err.message });
  }
});

module.exports = router;
