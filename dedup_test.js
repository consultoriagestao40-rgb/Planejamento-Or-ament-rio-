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
    } else if (lastComma > -1) s = s.replace(',', '.');
    else if (lastDot > -1) {
        const parts = s.split('.');
        if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, '');
    }
    return parseFloat(s) || 0;
};

let validRows = [];
let colCat = 14, colVal = 15;

for (let idx = 0; idx < data.length; idx++) {
    const cols = data[idx];
    if (idx === 0 || !cols || cols.length <= 1) continue;

    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[colCat] || '').toLowerCase().trim();
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') continue;

    const dataCompetencia = String(cols[0] || '').trim();
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
    if (!categoriaRaw && !dataCompetencia && Math.abs(finalAmount) === 0) continue;

    if (!categoriaRaw.includes('01.1')) continue;

    const costCenterRaw = String(cols[16] || '').trim();
    let ccId = costCenterRaw ? "mock-id-" + costCenterRaw : null;
    const finalDesc = String(cols[6] || cols[5] || cols[4] || cols[2] || "").substring(0, 80);

    validRows.push({
        idx,
        categoryId: "01.1.1",
        costCenterId: ccId,
        amount: finalAmount,
        description: finalDesc || 'DADO IMPORTADO DO ARQUIVO'
    });
}

const uniqueRows = [];
const seenKeys = new Set();
let dropped = [];

validRows.forEach(r => {
    const key = `${r.categoryId}-${r.costCenterId}-${r.amount}-${r.description}`;
    if (!seenKeys.has(key)) {
        seenKeys.add(key);
        uniqueRows.push(r);
    } else {
        dropped.push(r);
    }
});

console.log("Total unique rows:", uniqueRows.length);
console.log("Total dropped exact duplicates:", dropped.length);
dropped.forEach(d => console.log("Dropped:", d.amount, d.description));

