CREATE TABLE "account" (
	"id" text PRIMARY KEY,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"actor_id" text NOT NULL,
	"decision_tag" text NOT NULL,
	"occurred_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" text PRIMARY KEY,
	"order_id" text NOT NULL,
	"customer_id" text NOT NULL,
	"sku" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"lot_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"version" integer NOT NULL,
	"occurred_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL UNIQUE,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" text PRIMARY KEY,
	"sku" text NOT NULL,
	"warehouse_id" text NOT NULL,
	"quantity_on_hand" integer NOT NULL,
	"version" integer NOT NULL,
	"expires_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"email" text NOT NULL UNIQUE,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"tier" text DEFAULT 'Standard' NOT NULL,
	"credit_limit" integer DEFAULT 0 NOT NULL,
	"outstanding_balance" integer DEFAULT 0 NOT NULL,
	"overdraft_privilege" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" text PRIMARY KEY,
	"region" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_warehouse_id_warehouses_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id");