const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning orphaned RealizedJustifications to allow Prisma Push...");
  try {
    const result = await prisma.$executeRawUnsafe(`DELETE FROM "RealizedJustification" WHERE "categoryId" NOT IN (SELECT id FROM "Category")`);
    console.log("Deleted orphans:", result);
  } catch (e) {
    console.error("Error during orphan cleanup:", e);
  }

  console.log("Updating JVS Facilities financial category metadata...");
  try {
    const categoriesToUpdate = [
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:58736492-9937-4b52-b10f-247fdbbc49ad', // 06.1.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:8ff72ab7-c678-4170-a7dd-c2b328079fc7', // 06.1.2
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:4ae92803-c09c-4357-a085-218bf108b912', // 06.1.7
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:edc92b2c-cdb0-44d5-bc69-2055b9365860', // 06.2.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:e88cba21-a650-4796-9b6c-574968222933', // 06.2.2
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:2bc501cd-8fb4-43fe-9f93-c704daf7d20a', // 06.3.1
      'dc2b6eed-a38a-43c3-9465-ce854bfda90f:72c69d1c-db65-4ae0-a6d9-8fc3c83ccd5b'  // 06.4.1
    ];
    const updateResult = await prisma.category.updateMany({
      where: { id: { in: categoriesToUpdate } },
      data: { entradaDre: '06. DESPESAS FINANCEIRAS' }
    });
    console.log("Updated JVS finance categories:", updateResult);
  } catch (e) {
    console.error("Error updating JVS finance categories:", e);
  }

  console.log("Migrating existing RealizedEntry costCenterId records to prefixed format...");
  try {
    const entriesToFix = await prisma.realizedEntry.findMany({
      where: {
        costCenterId: {
          not: null,
          not: {
            contains: ':'
          }
        }
      },
      select: {
        id: true,
        tenantId: true,
        costCenterId: true
      }
    });

    console.log(`Found ${entriesToFix.length} realized entries to update with prefixed costCenterId.`);
    let updatedCount = 0;
    for (const entry of entriesToFix) {
      if (entry.costCenterId) {
        const prefixedId = `${entry.tenantId}:${entry.costCenterId}`;
        const targetCCExists = await prisma.costCenter.findUnique({
          where: { id: prefixedId }
        });
        if (!targetCCExists) {
          const rawCC = await prisma.costCenter.findUnique({
            where: { id: entry.costCenterId }
          });
          const ccName = rawCC ? rawCC.name : `Não Identificado (${entry.costCenterId.substring(0, 8)})`;
          await prisma.costCenter.create({
            data: {
              id: prefixedId,
              name: ccName,
              tenantId: entry.tenantId
            }
          });
        }
        await prisma.realizedEntry.update({
          where: { id: entry.id },
          data: { costCenterId: prefixedId }
        });
        updatedCount++;
      }
    }
    console.log(`Successfully updated ${updatedCount} realized entries.`);
  } catch (e) {
    console.error("Error migrating costCenterIds in realized entries:", e);
  }

  console.log("Migrating existing BudgetEntry costCenterId records to prefixed format...");
  try {
    const budgetsToFix = await prisma.budgetEntry.findMany({
      where: {
        costCenterId: {
          not: null,
          not: {
            contains: ':'
          }
        }
      },
      select: {
        id: true,
        tenantId: true,
        costCenterId: true,
        categoryId: true,
        month: true,
        year: true
      }
    });

    console.log(`Found ${budgetsToFix.length} budget entries to update with prefixed costCenterId.`);
    let updatedCount = 0;
    for (const entry of budgetsToFix) {
      if (entry.costCenterId) {
        const prefixedId = `${entry.tenantId}:${entry.costCenterId}`;
        const targetCCExists = await prisma.costCenter.findUnique({
          where: { id: prefixedId }
        });
        if (!targetCCExists) {
          const rawCC = await prisma.costCenter.findUnique({
            where: { id: entry.costCenterId }
          });
          const ccName = rawCC ? rawCC.name : `Não Identificado (${entry.costCenterId.substring(0, 8)})`;
          await prisma.costCenter.create({
            data: {
              id: prefixedId,
              name: ccName,
              tenantId: entry.tenantId
            }
          });
        }

        const existingPrefixedBudget = await prisma.budgetEntry.findUnique({
          where: {
            tenantId_categoryId_costCenterId_month_year: {
              tenantId: entry.tenantId,
              categoryId: entry.categoryId,
              costCenterId: prefixedId,
              month: entry.month,
              year: entry.year
            }
          }
        });

        if (existingPrefixedBudget) {
          await prisma.budgetEntry.delete({
            where: { id: entry.id }
          });
        } else {
          await prisma.budgetEntry.update({
            where: { id: entry.id },
            data: { costCenterId: prefixedId }
          });
          updatedCount++;
        }
      }
    }
    console.log(`Successfully updated/deduplicated ${updatedCount} budget entries.`);
  } catch (e) {
    console.error("Error migrating costCenterIds in budget entries:", e);
  }

  console.log("Migrating existing CostCenterLock costCenterId records...");
  try {
    const locksToFix = await prisma.costCenterLock.findMany({
      where: {
        costCenterId: {
          not: {
            contains: ':'
          }
        }
      }
    });

    console.log(`Found ${locksToFix.length} cost center locks to update.`);
    for (const entry of locksToFix) {
      const prefixedId = `${entry.tenantId}:${entry.costCenterId}`;
      const targetCCExists = await prisma.costCenter.findUnique({
        where: { id: prefixedId }
      });
      if (!targetCCExists) {
        const rawCC = await prisma.costCenter.findUnique({
          where: { id: entry.costCenterId }
        });
        const ccName = rawCC ? rawCC.name : `Não Identificado (${entry.costCenterId.substring(0, 8)})`;
        await prisma.costCenter.create({
          data: {
            id: prefixedId,
            name: ccName,
            tenantId: entry.tenantId
          }
        });
      }

      const existingPrefixedLock = await prisma.costCenterLock.findUnique({
        where: {
          tenantId_costCenterId_year: {
            tenantId: entry.tenantId,
            costCenterId: prefixedId,
            year: entry.year
          }
        }
      });

      if (existingPrefixedLock) {
        await prisma.costCenterLock.delete({
          where: { id: entry.id }
        });
      } else {
        await prisma.costCenterLock.update({
          where: { id: entry.id },
          data: { costCenterId: prefixedId }
        });
      }
    }
  } catch (e) {
    console.error("Error migrating costCenterIds in locks:", e);
  }

  console.log("Migrating existing RealizedJustification costCenterId records...");
  try {
    const justificationsToFix = await prisma.realizedJustification.findMany({
      where: {
        costCenterId: {
          not: null,
          not: {
            contains: ':'
          }
        }
      }
    });

    console.log(`Found ${justificationsToFix.length} justifications to update.`);
    for (const entry of justificationsToFix) {
      if (entry.costCenterId) {
        const prefixedId = `${entry.tenantId}:${entry.costCenterId}`;
        const targetCCExists = await prisma.costCenter.findUnique({
          where: { id: prefixedId }
        });
        if (!targetCCExists) {
          const rawCC = await prisma.costCenter.findUnique({
            where: { id: entry.costCenterId }
          });
          const ccName = rawCC ? rawCC.name : `Não Identificado (${entry.costCenterId.substring(0, 8)})`;
          await prisma.costCenter.create({
            data: {
              id: prefixedId,
              name: ccName,
              tenantId: entry.tenantId
            }
          });
        }
        await prisma.realizedJustification.update({
          where: { id: entry.id },
          data: { costCenterId: prefixedId }
        });
      }
    }
  } catch (e) {
    console.error("Error migrating costCenterIds in justifications:", e);
  }

  console.log("Cleaning up duplicate unprefixed CostCenter records and migrating references...");
  try {
    const rawCCs = await prisma.costCenter.findMany({
      where: {
        id: {
          not: {
            contains: ':'
          }
        }
      }
    });

    console.log(`Found ${rawCCs.length} unprefixed cost centers to clean up.`);
    for (const rawCC of rawCCs) {
      const prefixedId = `${rawCC.tenantId}:${rawCC.id}`;
      
      // 1. Ensure prefixed CostCenter exists
      const targetCCExists = await prisma.costCenter.findUnique({
        where: { id: prefixedId }
      });

      if (!targetCCExists) {
        // Create prefixed version, copying rawCC name
        await prisma.costCenter.create({
          data: {
            id: prefixedId,
            name: rawCC.name,
            tenantId: rawCC.tenantId
          }
        });
        console.log(`Created prefixed CostCenter: ${prefixedId} (${rawCC.name})`);
      } else {
        // If target has "Não Identificado" but rawCC has a real name, update target name
        const isTargetPlaceholder = targetCCExists.name.startsWith('Não Identificado');
        const isRawPlaceholder = rawCC.name.startsWith('Não Identificado');
        if (isTargetPlaceholder && !isRawPlaceholder) {
          await prisma.costCenter.update({
            where: { id: prefixedId },
            data: { name: rawCC.name }
          });
          console.log(`Updated prefixed CostCenter name to: ${rawCC.name}`);
        }
      }

      // 2. Migrate references in RealizedEntry
      const relUpdate = await prisma.realizedEntry.updateMany({
        where: { costCenterId: rawCC.id },
        data: { costCenterId: prefixedId }
      });
      if (relUpdate.count > 0) {
        console.log(`Migrated ${relUpdate.count} realized entries to prefixed costCenterId ${prefixedId}`);
      }

      // 3. Migrate references in BudgetEntry
      const budgetEntries = await prisma.budgetEntry.findMany({
        where: { costCenterId: rawCC.id }
      });
      for (const entry of budgetEntries) {
        const duplicate = await prisma.budgetEntry.findUnique({
          where: {
            tenantId_categoryId_costCenterId_month_year: {
              tenantId: entry.tenantId,
              categoryId: entry.categoryId,
              costCenterId: prefixedId,
              month: entry.month,
              year: entry.year
            }
          }
        });
        if (duplicate) {
          await prisma.budgetEntry.delete({
            where: { id: entry.id }
          });
        } else {
          await prisma.budgetEntry.update({
            where: { id: entry.id },
            data: { costCenterId: prefixedId }
          });
        }
      }

      // 4. Migrate references in CostCenterLock
      const locks = await prisma.costCenterLock.findMany({
        where: { costCenterId: rawCC.id }
      });
      for (const entry of locks) {
        const duplicate = await prisma.costCenterLock.findUnique({
          where: {
            tenantId_costCenterId_year: {
              tenantId: entry.tenantId,
              costCenterId: prefixedId,
              year: entry.year
            }
          }
        });
        if (duplicate) {
          await prisma.costCenterLock.delete({
            where: { id: entry.id }
          });
        } else {
          await prisma.costCenterLock.update({
            where: { id: entry.id },
            data: { costCenterId: prefixedId }
          });
        }
      }

      // 5. Migrate references in RealizedJustification
      await prisma.realizedJustification.updateMany({
        where: { costCenterId: rawCC.id },
        data: { costCenterId: prefixedId }
      });

      // 6. Migrate references in UserCostCenterAccess
      const accessEntries = await prisma.userCostCenterAccess.findMany({
        where: { costCenterId: rawCC.id }
      });
      for (const entry of accessEntries) {
        const duplicate = await prisma.userCostCenterAccess.findUnique({
          where: {
            userId_costCenterId: {
              userId: entry.userId,
              costCenterId: prefixedId
            }
          }
        });
        if (duplicate) {
          await prisma.userCostCenterAccess.delete({
            where: { id: entry.id }
          });
        } else {
          await prisma.userCostCenterAccess.update({
            where: { id: entry.id },
            data: { costCenterId: prefixedId }
          });
        }
      }

      // 7. Delete unprefixed CostCenter
      await prisma.costCenter.delete({
        where: { id: rawCC.id }
      });
      console.log(`Deleted unprefixed CostCenter: ${rawCC.id}`);
    }
  } catch (e) {
    console.error("Error cleaning up unprefixed cost centers:", e);
  }
}
main().finally(() => prisma.$disconnect());
