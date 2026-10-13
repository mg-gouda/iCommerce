import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012184549 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "invoice" drop constraint if exists "invoice_order_id_unique";`);
    this.addSql(`alter table if exists "credit_account" drop constraint if exists "credit_account_company_id_unique";`);
    this.addSql(`alter table if exists "company_member" drop constraint if exists "company_member_customer_id_unique";`);
    this.addSql(`alter table if exists "company_invitation" drop constraint if exists "company_invitation_token_unique";`);
    this.addSql(`alter table if exists "company" drop constraint if exists "company_handle_unique";`);
    this.addSql(`create table if not exists "company" ("id" text not null, "name" text not null, "handle" text not null, "country" text not null, "city" text null, "address" text null, "phone" text null, "tax_id" text null, "commercial_reg_no" text null, "export_card_no" text null, "kyc_status" text check ("kyc_status" in ('none', 'submitted', 'verified', 'rejected')) not null default 'none', "kyc_note" text null, "kyc_files" jsonb null, "verified_at" timestamptz null, "payment_mode" text check ("payment_mode" in ('upfront', 'net_terms')) not null default 'upfront', "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "company_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_company_handle_unique" ON "company" ("handle") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_company_deleted_at" ON "company" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "company_invitation" ("id" text not null, "email" text not null, "role" text check ("role" in ('admin', 'buyer', 'approver')) not null default 'buyer', "token" text not null, "expires_at" timestamptz not null, "accepted_at" timestamptz null, "company_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "company_invitation_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_company_invitation_token_unique" ON "company_invitation" ("token") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_company_invitation_company_id" ON "company_invitation" ("company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_company_invitation_deleted_at" ON "company_invitation" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "company_member" ("id" text not null, "customer_id" text not null, "email" text not null, "first_name" text null, "last_name" text null, "role" text check ("role" in ('admin', 'buyer', 'approver')) not null default 'buyer', "company_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "company_member_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_company_member_customer_id_unique" ON "company_member" ("customer_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_company_member_company_id" ON "company_member" ("company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_company_member_deleted_at" ON "company_member" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "credit_account" ("id" text not null, "company_id" text not null, "limit_usd" numeric not null, "terms_days" integer not null default 30, "status" text check ("status" in ('active', 'on_hold')) not null default 'active', "raw_limit_usd" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "credit_account_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_credit_account_company_id_unique" ON "credit_account" ("company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_credit_account_deleted_at" ON "credit_account" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`create table if not exists "invoice" ("id" text not null, "company_id" text not null, "order_id" text not null, "display_id" integer null, "amount" numeric not null, "currency_code" text not null default 'usd', "due_date" timestamptz not null, "status" text check ("status" in ('open', 'paid', 'overdue')) not null default 'open', "paid_at" timestamptz null, "raw_amount" jsonb not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "invoice_pkey" primary key ("id"));`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_company_id" ON "invoice" ("company_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_invoice_order_id_unique" ON "invoice" ("order_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_invoice_deleted_at" ON "invoice" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "company_invitation" add constraint "company_invitation_company_id_foreign" foreign key ("company_id") references "company" ("id") on update cascade;`);

    this.addSql(`alter table if exists "company_member" add constraint "company_member_company_id_foreign" foreign key ("company_id") references "company" ("id") on update cascade;`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "company_invitation" drop constraint if exists "company_invitation_company_id_foreign";`);

    this.addSql(`alter table if exists "company_member" drop constraint if exists "company_member_company_id_foreign";`);

    this.addSql(`drop table if exists "company" cascade;`);

    this.addSql(`drop table if exists "company_invitation" cascade;`);

    this.addSql(`drop table if exists "company_member" cascade;`);

    this.addSql(`drop table if exists "credit_account" cascade;`);

    this.addSql(`drop table if exists "invoice" cascade;`);
  }

}
