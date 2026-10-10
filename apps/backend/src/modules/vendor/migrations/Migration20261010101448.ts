import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261010101448 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "vendor" drop constraint if exists "vendor_legacy_id_unique";`);
    this.addSql(`alter table if exists "vendor_user" drop constraint if exists "vendor_user_email_unique";`);
    this.addSql(`create table if not exists "vendor_user" ("id" text not null, "email" text not null, "first_name" text null, "last_name" text null, "role" text check ("role" in ('owner', 'staff')) not null default 'owner', "vendor_id" text not null, "created_at" timestamptz not null default now(), "updated_at" timestamptz not null default now(), "deleted_at" timestamptz null, constraint "vendor_user_pkey" primary key ("id"));`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_user_email_unique" ON "vendor_user" ("email") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_vendor_id" ON "vendor_user" ("vendor_id") WHERE deleted_at IS NULL;`);
    this.addSql(`CREATE INDEX IF NOT EXISTS "IDX_vendor_user_deleted_at" ON "vendor_user" ("deleted_at") WHERE deleted_at IS NULL;`);

    this.addSql(`alter table if exists "vendor_user" add constraint "vendor_user_vendor_id_foreign" foreign key ("vendor_id") references "vendor" ("id") on update cascade;`);

    this.addSql(`alter table if exists "vendor" add column if not exists "logo" text null, add column if not exists "banner" text null, add column if not exists "description" text null, add column if not exists "phone" text null, add column if not exists "email" text null, add column if not exists "country" text null, add column if not exists "city" text null, add column if not exists "tax_id" text null, add column if not exists "commercial_reg_no" text null, add column if not exists "export_card_no" text null, add column if not exists "kyc_status" text check ("kyc_status" in ('none', 'submitted', 'verified', 'rejected')) not null default 'none', add column if not exists "kyc_note" text null, add column if not exists "kyc_files" jsonb null, add column if not exists "legacy_id" text null;`);
    this.addSql(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_vendor_legacy_id_unique" ON "vendor" ("legacy_id") WHERE deleted_at IS NULL;`);
  }

  override async down(): Promise<void> {
    this.addSql(`drop table if exists "vendor_user" cascade;`);

    this.addSql(`drop index if exists "IDX_vendor_legacy_id_unique";`);
    this.addSql(`alter table if exists "vendor" drop column if exists "logo", drop column if exists "banner", drop column if exists "description", drop column if exists "phone", drop column if exists "email", drop column if exists "country", drop column if exists "city", drop column if exists "tax_id", drop column if exists "commercial_reg_no", drop column if exists "export_card_no", drop column if exists "kyc_status", drop column if exists "kyc_note", drop column if exists "kyc_files", drop column if exists "legacy_id";`);
  }

}
