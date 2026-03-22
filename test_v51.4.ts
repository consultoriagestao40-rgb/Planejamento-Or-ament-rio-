import * as XLSX from "xlsx";
import fs from "fs";

function parseSaneNumber(val: any) {
    let s = String(val || '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');

    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) {
            s = s.replace(/\./g, '').replace(',', '.');
        } else {
            s = s.replace(/,/g, '');
        }
    } else if (lastComma > -1) {
        s = s.replace(',', '.');
    } else if (lastDot > -1) {
        const parts = s.split('.');
        if (parts[parts.length - 1].length === 3) {
            s = s.replace(/\./g, '');
        }
    }
    return parseFloat(s) || 0;
}

const wb = XLSX.readFile("planilha.xlsx", { cellDates: true, type: 'binary' });
const wsname = wb.SheetNames.find(n => n.includes('Competência')) || wb.SheetNames[0];
const matrix = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { header: 1 }) as any[][];

let colCat = -1;
let colVal = -1;

const firstRow = matrix[0] || [];
const headerIndices = firstRow.reduce((acc: any, cell: any, i: number) => {
    const s = String(cell || '').toLowerCase().trim();
    if (acc.val === -1 && (s === 'valor' || s.includes('valor na categoria'))) acc.val = i;
    if (acc.cat === -1 && (s === 'categoria' || s.includes('categoria 1') || s.includes('categoria 01'))) acc.cat = i;
    return acc;
}, { val: -1, cat: -1 });

if (headerIndices.cat !== -1) colCat = headerIndices.cat;
if (headerIndices.val !== -1) colVal = headerIndices.val;
if (colCat === 0 || colCat === -1) colCat = 14;
if (colVal === 0 || colVal === -1) colVal = 15;

let isHeader = false;
if (headerIndices.cat !== -1 || headerIndices.val !== -1 || 
    String(firstRow[colCat] || '').toLowerCase().includes('categoria') || 
    String(firstRow[colVal] || '').toLowerCase().includes('valor')) {
    isHeader = true;
}

const validRows: any[] = [];
let month = 1;

matrix.forEach((cols, idx) => {
    if (idx === 0 && isHeader) return;
    if (!cols || cols.length <= 1) return;

    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[colCat] || '').toLowerCase().trim();
    
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') {
        return;
    }

    const dataCompetencia = String(cols[0] || '').trim();
    let categoriaRaw = String(cols[colCat] || '').trim();
    let valP = parseSaneNumber(cols[colVal]);

    if (valP === 0 && String(cols[colVal] || '').trim() === '') {
        const altValStr = String(cols[colCat] || '').trim();
        const altVal = parseSaneNumber(altValStr);
        if (altVal !== 0 && !/^\d{1,2}(\.\d+)+/.test(altValStr)) {
            valP = altVal;
            categoriaRaw = String(cols[colCat-1] || '').trim();
        }
    }

    const finalAmount = isNaN(valP) ? 0 : valP;

    if (!categoriaRaw && !dataCompetencia && Math.abs(finalAmount) === 0) {
        return;
    }

    let effectiveCatId = "";
    if (finalAmount > 0) {
        effectiveCatId = categoriaRaw.includes('01.1') ? 'cat-rec' : '';
    }

    if (categoriaRaw.includes('01.1') || categoriaRaw.includes('03.1')) {
        let amtPrepared = finalAmount;
        let finalDesc = String(cols[6] || cols[5] || cols[4] || cols[2] || "").substring(0, 80);

        validRows.push({
            categoryId: categoriaRaw.includes('01.1') ? "01.1.1" : "03.1.1",
            costCenterId: null,
            description: finalDesc || 'DADO IMPORTADO',
            amount: parseFloat(amtPrepared.toFixed(2)),
            originalRow: idx
        });
    }
});

const uniqueRows: any[] = [];
const seenKeys = new Set();
validRows.forEach(r => {
    const key = `${r.categoryId}-${r.costCenterId}-${r.amount}-${r.description}`;
    if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueRows.push(r);
    } else {
        console.log(`⏭️ DUPLICATE OMITTED (Idx ${r.originalRow}):`, key);
    }
});

let sumRev = 0;
let sumExp = 0;
uniqueRows.forEach(r => {
    if (r.categoryId === "01.1.1") sumRev += r.amount;
    else sumExp += r.amount;
});

console.log("=== V51.4 PROCESS MATRIX SIMULATION ===");
console.log("Total Revenue:", sumRev.toFixed(2));
console.log("Total Salary:", sumExp.toFixed(2));
