import { test } from "node:test"
import assert from "node:assert/strict"
import { cleanText, decodeEntities, isoDate, mapProductAttributes, parsePrice, parseQty, phpUnserialize, slugify, stripSizeSuffix, titleCaseIfAllCaps, uniqueHandles, uploadsRelative } from "./transforms.ts"

test("decodeEntities", () => {
  assert.equal(decodeEntities("ED. FRUITS &amp; NUTS"), "ED. FRUITS & NUTS")
  assert.equal(decodeEntities("a &#8211; b &#x27;c&#039; &bogus;"), "a – b 'c' &bogus;")
  assert.equal(cleanText("  WORKS OF ART&amp;   ANTIQUES "), "WORKS OF ART& ANTIQUES")
})

test("titleCaseIfAllCaps", () => {
  assert.equal(titleCaseIfAllCaps("CARPETS & OTHER FLOOR COVERINGS"), "Carpets & Other Floor Coverings")
  assert.equal(titleCaseIfAllCaps("ARMS AND AMMUNITION"), "Arms and Ammunition")
  assert.equal(titleCaseIfAllCaps("LED TV PARTS"), "Led TV Parts")
  assert.equal(titleCaseIfAllCaps("FURNITURE & Fixtures"), "FURNITURE & Fixtures")
  assert.equal(titleCaseIfAllCaps("footwear"), "footwear")
})

test("slugify + uniqueHandles", () => {
  assert.equal(slugify("Café Chairs &amp; Tables!"), "cafe-chairs-tables")
  assert.equal(slugify("%d8%b3%d8%ac%d8%a7%d8%af"), "سجاد")
  assert.equal(slugify("***"), "")
  const u = uniqueHandles()
  assert.deepEqual([u("a", "x"), u("a", "x"), u("", "p-1"), u("a", "x")], ["a", "a-2", "p-1", "a-3"])
})

test("stripSizeSuffix", () => {
  assert.equal(stripSizeSuffix("2021/05/chair-380x300.jpg"), "2021/05/chair.jpg")
  assert.equal(stripSizeSuffix("2021/05/chair-scaled.JPG"), "2021/05/chair.JPG")
  assert.equal(stripSizeSuffix("2021/05/12x34-chair.png"), "2021/05/12x34-chair.png")
})

test("parsePrice / parseQty", () => {
  assert.equal(parsePrice("1,250.505"), 1250.51)
  assert.equal(parsePrice(" 0 "), 0)
  assert.equal(parsePrice("call us"), null)
  assert.equal(parsePrice(""), null)
  assert.equal(parseQty("0"), null)
  assert.equal(parseQty("100"), 100)
})

test("phpUnserialize + mapProductAttributes", () => {
  assert.deepEqual(phpUnserialize('a:1:{s:4:"logo";s:2:"12";}'), { logo: "12" })
  assert.equal(phpUnserialize("not serialized"), null)
  assert.equal(phpUnserialize('a:1:{s:9:"broken'), null)
  const raw = 'a:2:{s:7:"pa_unit";a:3:{s:4:"name";s:7:"pa_unit";s:5:"value";s:0:"";s:11:"is_taxonomy";i:1;}s:8:"Material";a:3:{s:4:"name";s:8:"Material";s:5:"value";s:16:"Oak | Pine &amp;";s:11:"is_taxonomy";i:0;}}'
  assert.deepEqual(mapProductAttributes(raw), { custom: { material: ["Oak", "Pine &"] }, taxonomies: ["pa_unit"] })
})

test("uploadsRelative / isoDate", () => {
  assert.equal(uploadsRelative("https://x.com/marketplace/wp-content/uploads/2021/05/a%20b.jpg?v=1"), "2021/05/a b.jpg")
  assert.equal(uploadsRelative("https://x.com/a.jpg"), null)
  assert.equal(isoDate("0000-00-00 00:00:00", "2022-01-02 03:04:05"), "2022-01-02T03:04:05Z")
})
