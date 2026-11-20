import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261119145721 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "sales_rep" drop constraint if exists "sales_rep_type_legacy_id_unique";`);
    this.addSql(`alter table if exists "sales_rep" drop constraint if exists "sales_rep_type_code_unique";`);
    this.addSql(`alter table if exists "sales_branch" drop constraint if exists "sales_branch_legacy_id_unique";`);
    this.addSql(`alter table if exists "sales_branch" drop constraint if exists "sales_branch_code_unique";`);
    this.addSql(`alter table if exists "sales_assignment" drop constraint if exists "sales_assignment_target_type_target_id_unique";`);
    this.addSql(`create table if not exists "report_line" ("id" text not null, "order_id" text not null, "parent_order_id" text not null, "vendor_id" text not null, "day" text not null, "channel" text check ("channel" in ('b2b', 'b2c')) not null, "product_id" text null, "variant_id" text null, "category_id" text null, "country_code" text null, "customer_id" text null, "company_id" text null, "buyer_label" text not null, "quantity" numeric not null, "gross" numeric not null, "commission" numeric not null, "fee_share" numeric not null, "paid" boolean not null default false, "branch_id" text null, "branch_manager_id" text null, "account_manager_id" text null, "broker_id" text null, "raw_quantity" jsonb not null, "raw_gross" jsonb not null, "raw_commission" jsonb not null, "raw_fee_share" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "report_line_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_report_line_order_id" ON "report_line" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_report_line_vendor_id" ON "report_line" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_report_line_day" ON "report_line" ("day") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_report_line_deleted_at" ON "report_line" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "sales_assignment" ("id" text not null, "target_type" text check ("target_type" in ('company', 'customer', 'vendor')) not null, "target_id" text not null, "branch_id" text null, "branch_manager_id" text null, "account_manager_id" text null, "broker_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sales_assignment_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_assignment_branch_id" ON "sales_assignment" ("branch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_assignment_branch_manager_id" ON "sales_assignment" ("branch_manager_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_assignment_account_manager_id" ON "sales_assignment" ("account_manager_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_assignment_broker_id" ON "sales_assignment" ("broker_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_assignment_deleted_at" ON "sales_assignment" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_assignment_target_type_target_id_unique" ON "sales_assignment" ("target_type", "target_id") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "sales_branch" ("id" text not null, "code" text not null, "name" text not null, "legacy_id" text null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sales_branch_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_branch_code_unique" ON "sales_branch" ("code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_branch_legacy_id_unique" ON "sales_branch" ("legacy_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_branch_deleted_at" ON "sales_branch" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "sales_rep" ("id" text not null, "type" text check ("type" in ('branch_manager', 'account_manager', 'broker')) not null, "code" text not null, "name" text not null, "email" text null, "branch_id" text null, "manager_id" text null, "legacy_id" text null, "active" boolean not null default true, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "sales_rep_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_rep_branch_id" ON "sales_rep" ("branch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_rep_manager_id" ON "sales_rep" ("manager_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_sales_rep_deleted_at" ON "sales_rep" ("deleted_at") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_rep_type_code_unique" ON "sales_rep" ("type", "code") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_sales_rep_type_legacy_id_unique" ON "sales_rep" ("type", "legacy_id") WHERE legacy_id IS NOT NULL AND deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "report_line" cascade;`);

    this.addSql(`drop table if exists "sales_assignment" cascade;`);

    this.addSql(`drop table if exists "sales_branch" cascade;`);

    this.addSql(`drop table if exists "sales_rep" cascade;`);
  }

}
