import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014095352 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "fee_tier" ("id" text not null, "channel" text check ("channel" in ('b2b', 'b2c')) not null, "basis" text check ("basis" in ('monthly_volume', 'order_total')) not null, "min_amount" numeric not null default 0, "percent" numeric not null default 0, "fixed_amount" numeric not null default 0, "min_fee" numeric null, "max_fee" numeric null, "currency" text not null default 'usd', "active_from" timestamptz null, "active_to" timestamptz null, "label_en" text not null, "label_ar" text not null, "raw_min_amount" jsonb not null default '{"value":"0","precision":20}', "raw_percent" jsonb not null default '{"value":"0","precision":20}', "raw_fixed_amount" jsonb not null default '{"value":"0","precision":20}', "raw_min_fee" jsonb null, "raw_max_fee" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "fee_tier_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_fee_tier_deleted_at" ON "fee_tier" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "fee_tier" cascade;`);
  }

}
