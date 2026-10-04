// Demo data: one company with an owner. No projects or stock — create projects in the app
// (each with a code), then add people to them from the project's Team section.
//   npm run db:seed          (SEED_OWNER_EMAIL to use your own address)
import { createDb } from "./db.js";
import { loadEnv } from "./env.js";
import { ensureDefaultRoles } from "./lib/permissions.js";

const env = loadEnv();
const db = createDb(env.DATABASE_URL);

const ownerEmail = (process.env.SEED_OWNER_EMAIL || "owner@example.com").toLowerCase();

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
    },
  });
  await ensureDefaultRoles(db, company.id);
  console.log(`Seeded XMTO demo: "${company.name}" — owner ${ownerEmail}. No projects yet.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
