// Industry groups for the filter chips on English Ready, Follow-ups and Spanish Ready (2026-11-17, Johnathon:
// "little tabs I can click and that get highlighted, like the industry that the business is in").
//
// Each lead's Industry field (`trade`) is free text written by Abby and Rob ("Home daycare (licensed child-care
// home)", "Esthetician / facials & lash lifts", "HVAC / Electrical" ...). This list turns it into a short group name.
// Rules are checked top to bottom and the FIRST match wins, so put narrower groups (Med Spas) above wider ones
// (Estheticians). Anything that matches nothing goes to "Other".
//
// To add an industry: add a line [ "Chip name", /words|to|match/i ] where you want it in the order (the chips show
// in this order). To catch a new spelling for an existing group, add the word to that group's pattern.
// This only changes how leads are grouped on screen; it never edits lead data.
window.AWD_INDUSTRIES = [
  ["Daycares",      /day ?care|child[- ]?care|preschool|nursery school|family home/i],
  ["Med Spas",      /med ?spa|medical spa|laser|botox|injectable/i],
  ["Estheticians",  /esthetic|aesthetic|skin|wax|lash|brow|threading|facial|sugaring/i],
  ["Barbers",       /barber/i],
  ["Salons",        /salon|hair|stylist|nail|beauty|makeup/i],
  ["Food & Bars",   /restaurant|\bbars?\b|lounge|icehouse|night club|cafe|bakery|cake|catering|food|taqueria|smoothie|snack|shave ice|grocery|convenience|produce/i],
  ["Laundry",       /dry clean|laundr|tailor|alteration/i],
  ["Cleaning",      /clean(?!up)|janitorial|pressure wash|power wash|biohazard|remediation/i],
  ["Auto & Boat",   /auto(?! title)|mechanic\b|\bcars?\b|towing|diesel|roadside|vehicle|truck|powersports|boat|marine/i],
  ["Health & Care", /home health|home care|care home|elderly|hospice|counsel|psycholog|medical|optometr|massage|fitness|personal train|gym|drug testing/i],
  ["Professional",  /tax|notary|title service|law office|attorney|real estate|property management|bookkeep|insurance|check cashing|consult|interpret|translat|investigat|tutor/i],
  ["Shops",         /shop|boutique|apparel|florist|gift|store|resale|consignment|nursery|plant|printing|sales/i],
  ["Service",       /electric|hvac|plumb|roof|contractor|remodel|construct|paint|floor|concrete|landscap|lawn|mow|pool|pest|garage door|well|drywall|fenc|insulation|window|door|tile|patio|tree|land clearing|excavat|site work|demolition|hauling|moving|locksmith|weld|\bsign|fire|security|camera|appliance|handyman|builder|charger|hydroseed|maintenance|preservation|modification|home services|mechanical|repair|install|carpentry/i]
];

// Group name for one lead's Industry text ("" → "Other").
window.awdIndustry = function (trade) {
  const t = String(trade || "").trim();
  if (t) for (const [name, re] of window.AWD_INDUSTRIES) if (re.test(t)) return name;
  return "Other";
};
