import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012184550 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "quote" ("id" text not null, "rfq_id" text not null, "company_id" text not null, "requester_id" text not null, "customer_id" text not null, "vendor_id" text not null, "status" text check ("status" in ('requested', 'vendor_review', 'offered', 'negotiating', 'pending_approval', 'accepted', 'ordered', 'rejected', 'expired')) not null default 'requested', "currency_code" text not null default 'usd', "validity_until" timestamptz null, "incoterm" text null, "notes" text null, "total" numeric null, "order_id" text null, "approved_by" text null, "raw_total" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quote_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_rfq_id" ON "quote" ("rfq_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_company_id" ON "quote" ("company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_vendor_id" ON "quote" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_deleted_at" ON "quote" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "quote_item" ("id" text not null, "product_id" text null, "variant_id" text null, "title" text not null, "quantity" numeric not null, "unit" text null, "target_price" numeric null, "offered_unit_price" numeric null, "lead_time_days" integer null, "quote_id" text not null, "raw_quantity" jsonb not null, "raw_target_price" jsonb null, "raw_offered_unit_price" jsonb null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quote_item_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_item_quote_id" ON "quote_item" ("quote_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_item_deleted_at" ON "quote_item" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "quote_message" ("id" text not null, "author" text check ("author" in ('buyer', 'vendor', 'system')) not null, "author_name" text null, "body" text not null, "quote_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "quote_message_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_message_quote_id" ON "quote_message" ("quote_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_quote_message_deleted_at" ON "quote_message" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "quote_item" add constraint "quote_item_quote_id_foreign" foreign key ("quote_id") references "quote" ("id") on update cascade;`);

    this.addSql(`alter table if exists "quote_message" add constraint "quote_message_quote_id_foreign" foreign key ("quote_id") references "quote" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "quote_item" drop constraint if exists "quote_item_quote_id_foreign";`);

    this.addSql(`alter table if exists "quote_message" drop constraint if exists "quote_message_quote_id_foreign";`);

    this.addSql(`drop table if exists "quote" cascade;`);

    this.addSql(`drop table if exists "quote_item" cascade;`);

    this.addSql(`drop table if exists "quote_message" cascade;`);
  }

}
