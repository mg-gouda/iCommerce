import { Migration } from "@medusajs/framework/mikro-orm/migrations";

export class Migration20261012075830 extends Migration {

  override async up(): Promise<void> {
    this.addSql(`alter table if exists "product_extra" add column if not exists "raw_min_qty" jsonb null, add column if not exists "raw_max_qty" jsonb null, add column if not exists "raw_qty_step" jsonb null;`);
    this.addSql(`alter table if exists "product_extra" alter column "min_qty" type numeric using ("min_qty"::numeric);`);
    this.addSql(`alter table if exists "product_extra" alter column "max_qty" type numeric using ("max_qty"::numeric);`);
    this.addSql(`alter table if exists "product_extra" alter column "qty_step" type numeric using ("qty_step"::numeric);`);
    // Integer → numeric is lossless; backfill the bigNumber raw_* columns the way Medusa writes them.
    for (const c of ["min_qty", "max_qty", "qty_step"]) {
      this.addSql(`update "product_extra" set "raw_${c}" = jsonb_build_object('value', "${c}"::text, 'precision', 20) where "${c}" is not null and "raw_${c}" is null;`);
    }
  }

  override async down(): Promise<void> {
    this.addSql(`alter table if exists "product_extra" drop column if exists "raw_min_qty", drop column if exists "raw_max_qty", drop column if exists "raw_qty_step";`);

    // Lossy if fractional values were stored since: they are rounded.
    this.addSql(`alter table if exists "product_extra" alter column "min_qty" type integer using ("min_qty"::integer);`);
    this.addSql(`alter table if exists "product_extra" alter column "max_qty" type integer using ("max_qty"::integer);`);
    this.addSql(`alter table if exists "product_extra" alter column "qty_step" type integer using ("qty_step"::integer);`);
  }

}
