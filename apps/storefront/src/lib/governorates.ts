// Egypt's 27 governorates. `code` = ISO 3166-2 (lowercase, stored as the address `province`).
export const GOVERNORATES = [
  ["eg-c", "Cairo", "القاهرة"],
  ["eg-gz", "Giza", "الجيزة"],
  ["eg-alx", "Alexandria", "الإسكندرية"],
  ["eg-kb", "Qalyubia", "القليوبية"],
  ["eg-dk", "Dakahlia", "الدقهلية"],
  ["eg-shr", "Sharqia", "الشرقية"],
  ["eg-gh", "Gharbia", "الغربية"],
  ["eg-mnf", "Monufia", "المنوفية"],
  ["eg-bh", "Beheira", "البحيرة"],
  ["eg-kfs", "Kafr El Sheikh", "كفر الشيخ"],
  ["eg-dt", "Damietta", "دمياط"],
  ["eg-pts", "Port Said", "بورسعيد"],
  ["eg-is", "Ismailia", "الإسماعيلية"],
  ["eg-suz", "Suez", "السويس"],
  ["eg-fym", "Faiyum", "الفيوم"],
  ["eg-bns", "Beni Suef", "بني سويف"],
  ["eg-mn", "Minya", "المنيا"],
  ["eg-ast", "Asyut", "أسيوط"],
  ["eg-shg", "Sohag", "سوهاج"],
  ["eg-kn", "Qena", "قنا"],
  ["eg-lx", "Luxor", "الأقصر"],
  ["eg-asn", "Aswan", "أسوان"],
  ["eg-ba", "Red Sea", "البحر الأحمر"],
  ["eg-wad", "New Valley", "الوادي الجديد"],
  ["eg-mt", "Matrouh", "مطروح"],
  ["eg-sin", "North Sinai", "شمال سيناء"],
  ["eg-js", "South Sinai", "جنوب سيناء"],
] as const

export const governorate = (code: string | null | undefined, locale: string) => {
  const g = GOVERNORATES.find(([c]) => c === code)
  return g ? (locale === "ar" ? g[2] : g[1]) : (code ?? "")
}
