-- Business invariants enforced by the database as a last line of defence.
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_reserved_nonneg CHECK ("quantityReserved" >= 0);
ALTER TABLE inventory_balances ADD CONSTRAINT inventory_balances_blocked_nonneg CHECK ("quantityBlocked" >= 0);
ALTER TABLE inventory_lots ADD CONSTRAINT inventory_lots_quantity_nonneg CHECK (quantity >= 0);
ALTER TABLE cost_layers ADD CONSTRAINT cost_layers_remaining_valid CHECK ("remainingQty" >= 0 AND "remainingQty" <= "originalQty");
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_quantity_positive CHECK (quantity > 0);
ALTER TABLE purchase_order_lines ADD CONSTRAINT po_lines_received_valid CHECK ("quantityReceived" >= 0 AND "quantityReceived" <= quantity);
ALTER TABLE sales_order_lines ADD CONSTRAINT sales_lines_quantity_positive CHECK (quantity > 0);
ALTER TABLE sales_order_lines ADD CONSTRAINT sales_lines_returned_valid CHECK ("returnedQty" >= 0 AND "returnedQty" <= quantity);
ALTER TABLE stock_transfer_lines ADD CONSTRAINT transfer_lines_quantity_positive CHECK (quantity > 0);
ALTER TABLE products ADD CONSTRAINT products_prices_nonneg CHECK ("salePrice" >= 0 AND "purchasePrice" >= 0 AND "averageCost" >= 0);
-- The stock ledger is append-only.
CREATE OR REPLACE FUNCTION inventory_movements_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'inventory_movements is append-only';
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER inventory_movements_no_update BEFORE UPDATE OR DELETE ON inventory_movements
  FOR EACH ROW WHEN (current_setting('stockiteasy.allow_ledger_maintenance', true) IS DISTINCT FROM 'on')
  EXECUTE FUNCTION inventory_movements_immutable();
