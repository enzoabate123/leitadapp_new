import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  console.log(users.map(u => ({ id: u.id, username: u.username, role: u.role, passwordHash: u.password })));
}
main();
