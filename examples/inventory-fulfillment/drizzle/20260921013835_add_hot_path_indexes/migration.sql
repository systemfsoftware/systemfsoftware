CREATE INDEX "account_user_id_idx" ON "account" ("user_id");--> statement-breakpoint
CREATE INDEX "audit_events_order_id_idx" ON "audit_events" ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_order_id_idx" ON "reservations" ("order_id");--> statement-breakpoint
CREATE INDEX "reservations_lot_id_idx" ON "reservations" ("lot_id");--> statement-breakpoint
CREATE INDEX "session_user_id_idx" ON "session" ("user_id");--> statement-breakpoint
CREATE INDEX "stock_lots_sku_idx" ON "stock_lots" ("sku");--> statement-breakpoint
CREATE INDEX "stock_lots_warehouse_id_idx" ON "stock_lots" ("warehouse_id");
