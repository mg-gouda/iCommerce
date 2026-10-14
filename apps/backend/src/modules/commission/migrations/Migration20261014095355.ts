import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014095355 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "commission_rule" ("id" text not null, "scope" text check ("scope" in ('global', 'plan', 'category', 'vendor', 'vendor_category')) not null, "scope_id" text null, "channel" text check ("channel" in ('b2c', 'b2b', 'all')) not null default 'all', "percent" numeric not null default 0, "fixed_amount" numeric not null default 0, "min" numeric null, "max" numeric null, "active_from" timestamptz null, "active_to" timestamptz null, "note" text null, "raw_percent" jsonb not null default '{"value":"0","precision":20}', "raw_fixed_amount" jsonb not null default '{"value":"0","precision":20}', "raw_min" jsonb null, "raw_max" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "commission_rule_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_rule_scope_id" ON "commission_rule" ("scope_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_commission_rule_deleted_at" ON "commission_rule" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "commission_rule" cascade;`);
  }

}
