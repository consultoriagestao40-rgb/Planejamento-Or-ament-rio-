const XLSX = require("xlsx");
const wb = XLSX.readFile("planilha.xlsx", { cellDates: true });
const wsname = wb.SheetNames.find(n => n.includes('Competência')) || wb.SheetNames[0];
const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { header: 1 });

const parseSaneNumber = (val) => {
    let s = String(val || '').trim().replace(/[R$\s]/g, '');
    if (!s) return 0;
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > -1 && lastDot > -1) {
        if (lastComma > lastDot) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (lastComma > -1) {
        s = s.replace(',', '.');
    } else if (lastDot > -1) {
        const parts = s.split('.');
        if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
    return parseFloat(s) || 0;
};

let colCat = 14; 
let colVal = 15; 
const firstRow = data[0] || [];
const headerIndices = firstRow.reduce((acc, cell, i) => {
    const s = String(cell || '').toLowerCase().trim();
    if (s === 'valor' || s.includes('valor na categoria')) acc.val = i;
    if (s === 'categoria' || s.includes('categoria 1') || s.includes('categoria 01')) acc.cat = i;
    return acc;
}, { val: -1, cat: -1 });

if (headerIndices.cat !== -1) colCat = headerIndices.cat;
if (headerIndices.val !== -1) colVal = headerIndices.val;
if (colCat === 0 || colCat === -1) colCat = 14;
if (colVal === 0 || colVal === -1) colVal = 15;

for (let idx = 0; idx < data.length; idx++) {
    const cols = data[idx];
    if (idx === 0) continue; 
    if (!cols || cols.length <= 1) continue;

    const originalCol15Str = String(cols[15]);
    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[colCat] || '').toLowerCase().trim();
    
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') {
        if(originalCol15Str.includes('6.259')) console.log(">> DROPPED BY TOTAL FILTER");
        continue;
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
    
    let target = Math.abs(finalAmount);
    const isTarget = target === 6259 || target === 10025.22 || target === 9565.65 || target === 1698 || target === 4134 || target === 12009;

    if (isTarget) console.log(">> 🎯 TARGET FINISHED PARSING IDX:", idx, "Amount:", finalAmount, "Cat:", categoriaRaw);

    if (!categoriaRaw && !dataCompetencia && Math.abs(finalAmount) === 0) {
        if (isTarget) console.log(">> ❌ DROPPED BY EMPTY FILTER");
        continue;
    }

    if (categoriaRaw.includes('01.1')) {
        if (isTarget) console.log(">> ✅ INCLUDED IN 114K SUM");
    }
}
