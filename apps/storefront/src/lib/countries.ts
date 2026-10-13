// ISO 3166-1 alpha-2 codes; names come from Intl.DisplayNames in the buyer's language.
export const COUNTRIES = (
  "AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN CO CR CU CV CY CZ " +
  "DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE IL IN IQ IR IS IT JM JO JP " +
  "KE KG KH KM KN KR KW KZ LA LB LC LK LR LS LT LU LV LY MA MC MD ME MG MK ML MM MN MR MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NZ " +
  "OM PA PE PG PH PK PL PS PT PY QA RO RS RU RW SA SB SC SD SE SG SI SK SL SN SO SR SS SV SY SZ TD TG TH TJ TL TM TN TO TR TT TW TZ " +
  "UA UG US UY UZ VC VE VN YE ZA ZM ZW"
).split(" ")

export function countryOptions(locale: string) {
  const names = new Intl.DisplayNames([locale], { type: "region" })
  return COUNTRIES.map((c) => [c, names.of(c) ?? c] as const).sort((a, b) => a[1].localeCompare(b[1], locale))
}
