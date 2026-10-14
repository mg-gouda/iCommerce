import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014095358 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`create table if not exists "ledger_entry" ("id" text not null, "vendor_id" text not null, "vendor_order_id" text null, "order_display_id" integer null, "type" text check ("type" in ('sale', 'commission', 'fee_collected', 'refund', 'payout', 'adjustment')) not null, "amount" numeric not null, "currency_code" text not null default 'usd', "status" text check ("status" in ('pending', 'available', 'paid')) not null default 'pending', "available_at" timestamptz null, "batch_id" text null, "note" text null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "ledger_entry_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_vendor_id" ON "ledger_entry" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_vendor_order_id" ON "ledger_entry" ("vendor_order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_batch_id" ON "ledger_entry" ("batch_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_ledger_entry_deleted_at" ON "ledger_entry" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "payout_batch" ("id" text not null, "vendor_id" text not null, "amount" numeric not null, "currency_code" text not null default 'usd', "status" text check ("status" in ('open', 'paid')) not null default 'open', "reference" text null, "paid_at" timestamptz null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "payout_batch_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_batch_vendor_id" ON "payout_batch" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_payout_batch_deleted_at" ON "payout_batch" ("deleted_at") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "ledger_entry" cascade;`);

    this.addSql(`drop table if exists "payout_batch" cascade;`);
  }

}
