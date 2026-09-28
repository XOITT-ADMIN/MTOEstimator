// Demo data: one company, an owner and a field engineer, a few stock lines and one estimate.
//   npm run db:seed          (SEED_OWNER_EMAIL / SEED_ENGINEER_EMAIL to use your own addresses)
import { findItem, stockKey } from "@mto/shared";

import { createDb } from "./db.js";
import { loadEnv } from "./env.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

const ownerEmail = (process.env.SEED_OWNER_EMAIL || "owner@example.com").toLowerCase();
const engineerEmail = (process.env.SEED_ENGINEER_EMAIL || "engineer@example.com").toLowerCase();
const pmEmail = (process.env.SEED_PM_EMAIL || "pm@example.com").toLowerCase();
const financeEmail = (process.env.SEED_FINANCE_EMAIL || "finance@example.com").toLowerCase();

const stock = [
  { trade: "Plumbing", family: "Pipe", item: "Pipe", material: "PVC", size: "40 mm", stock: 500 },
  { trade: "Plumbing", family: "Pipe", item: "Pipe", material: "CPVC", size: "25 mm", stock: 300 },
  { trade: "Plumbing", family: "Pipe Fitting", item: "Reducer Bush", material: "UPVC", size: "50 mm", secondarySize: "40 mm", stock: 40 },
  { trade: "Plumbing", family: "Pipe Fitting", item: "Union", material: "CPVC", size: "25 mm", stock: 60 },
  { trade: "Plumbing", family: "Valve", item: "Ball Valve", material: "Brass", size: "25 mm", stock: 24 },
  { trade: "Electrical", family: "Power Cable", item: "Power Cable", material: "Copper", size: "2.5 sq.mm", core: "4C", stock: 1000 },
  { trade: "Electrical", family: "Cable Management", item: "Cable Tray", material: "GI", size: "100 mm", stock: 120 },
];

async function main() {
  const existing = await db.user.findUnique({ where: { email: ownerEmail }, include: { membership: true } });
  if (existing?.membership) {
    console.log(`Seed skipped: ${ownerEmail} is already in a company.`);
    return;
  }
  const owner = await db.user.upsert({ where: { email: ownerEmail }, create: { email: ownerEmail, name: "Suraj (Owner)" }, update: {} });
  const company = await db.company.create({
    data: {
      name: "Demo MEP Contractors",
      profile: { address: "Whitefield, Bengaluru, Karnataka", phone: "", email: "", gstin: "", termsAndConditions: "1. Rates valid for 30 days.\n2. GST extra as applicable." },
      members: { create: { userId: owner.id, roles: ["owner"] } },
      invites: {
        create: [
          { email: engineerEmail, name: "Ravi (Site Supervisor)", roles: ["site_supervisor"], invitedById: owner.id },
          { email: pmEmail, name: "Priya (Project Manager)", roles: ["project_manager"], invitedById: owner.id },
          { email: financeEmail, name: "Farhan (Finance)", roles: ["finance"], invitedById: owner.id },
        ],
      },
    },
  });
  await db.project.create({ data: { companyId: company.id, name: "Whitefield Tower", siteName: "Whitefield, Bengaluru", createdById: owner.id } });
  for (const s of stock) {
    const key = stockKey({ ...s, secondarySize: s.secondarySize ?? null, core: s.core ?? null });
    await db.stockLine.create({
      data: {
        companyId: company.id, key, trade: s.trade, family: s.family, item: s.item, material: s.material, size: s.size,
        secondarySize: s.secondarySize ?? null, core: s.core ?? null, unit: findItem(s.trade, s.item)?.unit || "Nos", onHand: s.stock,
      },
    });
  }
  console.log(`Seeded XMTO demo: "${company.name}" — owner ${ownerEmail}, invited engineer ${engineerEmail}, ${stock.length} stock lines.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
