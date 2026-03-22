import * as XLSX from "xlsx";

function parseSaneNumber(val: any) {
    let s = String(val || '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (lastComma > -1) s = s.replace(',', '.');
    else if (lastDot > -1) {
        const parts = s.split('.');
        if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
    return parseFloat(s) || 0;
}

const wb = XLSX.readFile("planilha.xlsx", { cellDates: true, type: 'binary' });
const wsname = wb.SheetNames.find(n => n.includes('Competência')) || wb.SheetNames[0];
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { header: 1 }) as any[][];

let colCat = 14, colVal = 15;
const firstRow = matrix[0] || [];
const headerIndices = firstRow.reduce((acc: any, cell: any, i: number) => {
    const s = String(cell || '').toLowerCase().trim();
    if (acc.val === -1 && (s === 'valor' || s.includes('valor na categoria'))) acc.val = i;
    if (acc.cat === -1 && (s === 'categoria' || s.includes('categoria 1') || s.includes('categoria 01'))) acc.cat = i;
    return acc;
}, { val: -1, cat: -1 });
colCat = headerIndices.cat !== -1 ? headerIndices.cat : 14;
colVal = headerIndices.val !== -1 ? headerIndices.val : 15;

const groupCategories = [{ id: "cat-1", name: "01.1.1 -Serviços Vendidos ", tenantId: "T1" }];
const groupCCs = [
    { id: "cc-oss", name: "Associação da Galeria General Osório", tenantId: "T1" },
    { id: "cc-dju", name: "DAJU BARIGUI", tenantId: "T1" },
    { id: "cc-dpa", name: "DAJU PARANAGUA", tenantId: "T1" },
    { id: "cc-dag", name: "DAJU AGUA VERDE ADM", tenantId: "T1" },
    { id: "cc-lun", name: "LUNARDON E MEDEIROS ADVOGADOS ASSOCIADOS", tenantId: "T1" }
];

const validRows: any[] = [];
let sumRawExtracted = 0;

matrix.forEach((cols, idx) => {
    if (idx === 0) return;
    if (!cols || cols.length <= 1) return;

    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[colCat] || '').toLowerCase().trim();
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') return;

    let valP = parseSaneNumber(cols[colVal]);
    let categoriaRaw = String(cols[colCat] || '').trim();

    if (valP === 0 && String(cols[colVal] || '').trim() === '') {
        const altValStr = String(cols[colCat] || '').trim();
        const altVal = parseSaneNumber(altValStr);
        if (altVal !== 0 && !/^\d{1,2}(\.\d+)+/.test(altValStr)) {
            valP = altVal;
            categoriaRaw = String(cols[colCat-1] || '').trim();
        }
    }
    const finalAmount = isNaN(valP) ? 0 : valP;
    
    if (idx === 27 || idx === 165 || Math.abs(finalAmount - 9814.1) < 0.1 || Math.abs(finalAmount - 3574.9) < 0.1) {
        console.log(`[DEBUG RAW] Row ${idx} -> Amt: ${finalAmount} | Cat: ${categoriaRaw}`);
    }

    if (!categoriaRaw.includes('01.1')) return;

    sumRawExtracted += finalAmount;

    let effectiveCat = groupCategories[0];
    let amtPrepared = finalAmount;
    const rateiosInfo: any[] = [];
    const restCols = cols.slice(colVal + 1);
    
    for (let i = 0; i < restCols.length; i += 2) {
        const ccName = String(restCols[i] || '').trim();
        const ccValStr = String(restCols[i + 1] || '').trim();
        if (ccName && ccValStr) {
            const amtCC = parseSaneNumber(ccValStr);
            const foundCC = groupCCs.find(c => c.name === ccName);
            if (foundCC) rateiosInfo.push({ ccId: foundCC.id, ccName, amountInformado: amtCC });
        }
    }

    const finalDesc = String(cols[6] || cols[5] || cols[4] || cols[2] || "").substring(0, 80);

    if (rateiosInfo.length > 0) {
        const sumCCs = rateiosInfo.reduce((acc, curr) => acc + curr.amountInformado, 0);
        let totalDistributed = 0;
        rateiosInfo.forEach((info) => {
            let proportion = 1;
            if (Math.abs(sumCCs) > 0.01) proportion = info.amountInformado / sumCCs;
            let fragAmt = finalAmount * proportion;
            validRows.push({ categoryId: effectiveCat.id, costCenterId: info.ccId, amount: parseFloat(fragAmt.toFixed(2)), description: finalDesc });
            totalDistributed += fragAmt;
        });
        const remainder = finalAmount - totalDistributed;
        if (Math.abs(remainder) > 0.01) {
            validRows.push({ categoryId: effectiveCat.id, costCenterId: rateiosInfo[0].ccId, amount: parseFloat(remainder.toFixed(2)), description: finalDesc });
        }
    } else {
        validRows.push({ categoryId: effectiveCat.id, costCenterId: null, amount: parseFloat(finalAmount.toFixed(2)), description: finalDesc });
    }
});

console.log("Raw Extracted 01.1 Sum:", sumRawExtracted.toFixed(2));

const uniqueRows: any[] = [];
let sumUniqueRev = 0;
const seenKeys = new Set();

validRows.forEach(r => {
    const key = `${r.categoryId}-${r.costCenterId}-${r.amount}-${r.description}`;
    if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueRows.push(r);
        sumUniqueRev += r.amount;
    } else {
        console.log(`⏭️ DEDUPLICATED:`, key);
    }
});

console.log("Final Sum after Rateios & Dedup:", sumUniqueRev.toFixed(2));
