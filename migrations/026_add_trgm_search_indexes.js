/**
 * Migration 026: Add pg_trgm extension and high-speed GIN trigram indexes for instant fuzzy search
 * Accelerates ILIKE '%query%' searches on product name, code, barcode, and variant SKU.
 */

exports.up = async function(knex) {
  try {
    await knex.raw(`CREATE EXTENSION IF NOT EXISTS pg_trgm;`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_products_name_trgm ON products USING gin (product_name gin_trgm_ops);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_products_code_trgm ON products USING gin (product_code gin_trgm_ops);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_products_barcode_trgm ON products USING gin (barcode gin_trgm_ops);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_product_variants_sku_trgm ON product_variants USING gin (variant_sku gin_trgm_ops);`);
    await knex.raw(`CREATE INDEX IF NOT EXISTS idx_product_variants_barcode_trgm ON product_variants USING gin (barcode gin_trgm_ops);`);
  } catch (err) {
    console.warn('Migration 026 warning (pg_trgm indexes):', err.message);
  }
};

exports.down = async function(knex) {
  try {
    await knex.raw(`DROP INDEX IF EXISTS idx_products_name_trgm;`);
    await knex.raw(`DROP INDEX IF EXISTS idx_products_code_trgm;`);
    await knex.raw(`DROP INDEX IF EXISTS idx_products_barcode_trgm;`);
    await knex.raw(`DROP INDEX IF EXISTS idx_product_variants_sku_trgm;`);
    await knex.raw(`DROP INDEX IF EXISTS idx_product_variants_barcode_trgm;`);
  } catch (err) {
    console.warn('Migration 026 rollback warning:', err.message);
  }
};
