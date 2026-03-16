
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const jvs = await prisma.tenant.findMany({
    where: { name: { contains: 'JVS', mode: 'insensitive' } },
    include: {
      categories: {
        select: {
          id: true,
          name: true,
          entradaDre: true
        }
      }
    }
  });

  console.log(JSON.stringify(jvs, null, 2));
}

main()
  .catch(e => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
