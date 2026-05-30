import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.store.count();
  if (count > 0) {
    console.log(`Database already has ${count} store(s); skip seed.`);
    return;
  }
  console.log("Database is empty; running seed data.");
  execSync("npm run db:seed", { stdio: "inherit" });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
