import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { prisma } from '../../../lib/prisma';
import { getValidAccessToken } from '../../../lib/services';

async function run() {
    try {
        const tenant = await prisma.tenant.findFirst();
        if (!tenant) return console.log("No tenant");

        const { token } = await getValidAccessToken();
        const res = await fetch('https://api-v2.contaazul.com/v1/centro-de-custo?tamanho_pagina=100', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        const items = data || data.itens;

        console.log("FIRST ACTIVE:");
        const activeItem = items.find((i: any) => i.status === 'ATIVO' || i.ativo || i.is_active || !i.inativo);
        console.log(JSON.stringify(activeItem, null, 2));

        console.log("FIRST INACTIVE (or another):");
        const inactiveItem = items.find((i: any) => i.status !== 'ATIVO' || !i.ativo || i.is_active === false || i.inativo) || items[items.length - 1];
        console.log(JSON.stringify(inactiveItem, null, 2));
    } catch (e) {
        console.error(e);
    }
}
run();
