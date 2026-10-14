import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261014094820 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "quote" drop constraint if exists "quote_status_check";`);

    this.addSql(`alter table if exists "quote_message" drop constraint if exists "quote_message_author_check";`);

    this.addSql(`alter table if exists "quote" alter column "vendor_id" type text using ("vendor_id"::text);`);
    this.addSql(`alter table if exists "quote" alter column "vendor_id" drop not null;`);
    this.addSql(`alter table if exists "quote" add constraint "quote_status_check" check("status" in ('routing', 'routed', 'requested', 'vendor_review', 'offered', 'negotiating', 'pending_approval', 'accepted', 'ordered', 'rejected', 'expired'));`);

    this.addSql(`alter table if exists "quote_message" add constraint "quote_message_author_check" check("author" in ('buyer', 'vendor', 'system', 'platform'));`);
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "quote" drop constraint if exists "quote_status_check";`);

    this.addSql(`alter table if exists "quote_message" drop constraint if exists "quote_message_author_check";`);

    this.addSql(`alter table if exists "quote" alter column "vendor_id" type text using ("vendor_id"::text);`);
    this.addSql(`alter table if exists "quote" alter column "vendor_id" set not null;`);
    this.addSql(`alter table if exists "quote" add constraint "quote_status_check" check("status" in ('requested', 'vendor_review', 'offered', 'negotiating', 'pending_approval', 'accepted', 'ordered', 'rejected', 'expired'));`);

    this.addSql(`alter table if exists "quote_message" add constraint "quote_message_author_check" check("author" in ('buyer', 'vendor', 'system'));`);
  }

}
