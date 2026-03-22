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

let rawRows = [];
let parsedRows = [];

// 1. Raw extraction (Find any column with 01.1.1)
data.forEach((row, idx) => {
    const strRow = JSON.stringify(row);
    if (strRow.includes("01.1.1")) {
        for (let i = 0; i < row.length; i++) {
            if (String(row[i]).includes("01.1.1")) {
                const valStr = String(row[i+1] || row[i+2] || row[row.length-1] || "");
                const val = parseSaneNumber(valStr);
                if (val > 0 && val < 50000) { 
                    rawRows.push({ idx, row, val });
                }
            }
        }
    }
});

// 2. V51.3 logic
for (let idx = 0; idx < data.length; idx++) {
    const cols = data[idx];
    if (idx === 0) continue; 
    if (!cols || cols.length <= 1) continue;

    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[14] || '').toLowerCase().trim();
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') {
        continue;
    }

    const dataCompetencia = String(cols[0] || '').trim();
    let categoriaRaw = String(cols[14] || '').trim();
    let valP = parseSaneNumber(cols[15]);
    
    if (valP === 0 && String(cols[15] || '').trim() === '') {
        const altValStr = String(cols[14] || '').trim();
        const altVal = parseSaneNumber(altValStr);
        if (altVal !== 0 && !/^\d{1,2}(\.\d+)+/.test(altValStr)) {
            valP = altVal;
            categoriaRaw = String(cols[13] || '').trim();
        }
    }
    const finalAmount = isNaN(valP) ? 0 : valP;
    if (!categoriaRaw && !dataCompetencia && Math.abs(finalAmount) === 0) continue;

    if (categoriaRaw.includes('01.1')) {
        parsedRows.push({ idx, val: finalAmount });
    }
}

// Compare
rawRows.forEach(raw => {
    const found = parsedRows.find(p => p.idx === raw.idx && p.val === raw.val);
    if (!found) {
        console.log("❌ ROW DROPPED BY PARSER:");
        console.log(`Line ${raw.idx + 1} | Val: ${raw.val}`);
        console.log(raw.row);
        let col14 = raw.row[14], col15 = raw.row[15];
        console.log(`Col 14: ${col14} | Col 15: ${col15}`);
        console.log("---");
    }
});
