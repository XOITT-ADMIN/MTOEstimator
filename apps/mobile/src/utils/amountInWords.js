// "Rupees eight thousand twenty-four only" — Indian grouping (thousand, lakh, crore).
const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

function upTo99(n) {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? "-" + ONES[n % 10] : "");
}

function upTo999(n) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} hundred` : "", r ? upTo99(r) : ""].filter(Boolean).join(" ");
}

export function numberToWords(num) {
  let n = Math.floor(Math.abs(Number(num) || 0));
  if (n === 0) return "zero";
  const parts = [];
  const crore = Math.floor(n / 1e7);
  n %= 1e7;
  const lakh = Math.floor(n / 1e5);
  n %= 1e5;
  const thousand = Math.floor(n / 1e3);
  n %= 1e3;
  if (crore) parts.push(`${numberToWords(crore)} crore`);
  if (lakh) parts.push(`${upTo99(lakh)} lakh`);
  if (thousand) parts.push(`${upTo99(thousand)} thousand`);
  if (n) parts.push(upTo999(n));
  return parts.join(" ");
}

export function rupeesInWords(amount) {
  const rupees = Math.floor(Math.abs(Number(amount) || 0));
  const paise = Math.round((Math.abs(Number(amount) || 0) - rupees) * 100);
  const words = `Rupees ${numberToWords(rupees)}${paise ? ` and ${numberToWords(paise)} paise` : ""} only`;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
