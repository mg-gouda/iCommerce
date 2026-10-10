import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010101449 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_extra" drop constraint if exists "product_extra_legacy_id_unique";`);
    this.addSql(`create table if not exists "product_extra" ("id" text not null, "unit" text null, "min_qty" integer null, "max_qty" integer null, "qty_step" integer null, "hs_code" text null, "cost_price" numeric null, "b2b_only" boolean not null default false, "b2c_enabled" boolean not null default true, "origin_country" text not null default 'EG', "legacy_id" text null, "raw_cost_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "product_extra_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_product_extra_legacy_id_unique" ON "product_extra" ("legacy_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_product_extra_deleted_at" ON "product_extra" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "product_extra" cascade;`);
  }

}
