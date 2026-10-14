import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014095401 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor_subscription" drop constraint if exists "vendor_subscription_vendor_id_unique";`);
    this.addSql(`alter table if exists "plan" drop constraint if exists "plan_handle_unique";`);
    this.addSql(`create table if not exists "plan" ("id" text not null, "handle" text not null, "name_en" text not null, "name_ar" text not null, "price_usd" numeric not null default 0, "interval" text check ("interval" in ('monthly', 'yearly')) not null default 'monthly', "product_limit" integer null, "staff_limit" integer null, "featured_slots" integer not null default 0, "can_b2b" boolean not null default false, "analytics_level" text check ("analytics_level" in ('basic', 'full')) not null default 'basic', "active" boolean not null default true, "raw_price_usd" jsonb not null default '{"value":"0","precision":20}', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "plan_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_plan_handle_unique" ON "plan" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_plan_deleted_at" ON "plan" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "vendor_subscription" ("id" text not null, "vendor_id" text not null, "status" text check ("status" in ('trial', 'active', 'past_due', 'cancelled')) not null default 'active', "current_period_start" timestamptz null, "current_period_end" timestamptz null, "requested_plan_id" text null, "plan_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_subscription_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_subscription_vendor_id_unique" ON "vendor_subscription" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_subscription_plan_id" ON "vendor_subscription" ("plan_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_subscription_deleted_at" ON "vendor_subscription" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vendor_subscription" add constraint "vendor_subscription_plan_id_foreign" foreign key ("plan_id") references "plan" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "vendor_subscription" drop constraint if exists "vendor_subscription_plan_id_foreign";`);

    this.addSql(`drop table if exists "plan" cascade;`);

    this.addSql(`drop table if exists "vendor_subscription" cascade;`);
  }

}
