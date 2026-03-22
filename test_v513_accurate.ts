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

// STRICT V51.3 BEHAVIOR (Categoria 2 OVERWRITE BUG)
let colCat = 14, colVal = 15;
const firstRow = matrix[0] || [];
const headerIndices = firstRow.reduce((acc: any, cell: any, i: number) => {
    const s = String(cell || '').toLowerCase().trim();
    if (s === 'valor' || s.includes('valor na categoria')) acc.val = i; // OVERWRITES TO 69
    if (s === 'categoria' || s.includes('categoria 1') || s.includes('categoria 01')) acc.cat = i; // REMAINS 14
    return acc;
}, { val: -1, cat: -1 });

colCat = headerIndices.cat !== -1 ? headerIndices.cat : 14;
colVal = headerIndices.val !== -1 ? headerIndices.val : 15;

const validRows: any[] = [];
let sumRev = 0;

matrix.forEach((cols, idx) => {
    if (idx === 0) return;
    if (!cols || cols.length <= 1) return;

    const col0 = String(cols[0] || '').toLowerCase().trim();
    const colC = String(cols[colCat] || '').toLowerCase().trim(); // colC is cols[14]
    if (col0.includes('total') || col0.includes('soma') || colC.includes('total geral') || col0 === 'saldo') return;

    let valP = parseSaneNumber(cols[colVal]); // cols[69]
    let categoriaRaw = String(cols[colCat] || '').trim(); // cols[14]

    // Fallback logic
    if (valP === 0 && String(cols[colVal] || '').trim() === '') {
        const altValStr = String(cols[colCat] || '').trim(); // cols[14] is "01.1.1 - Serviços Vendidos"
        const altVal = parseSaneNumber(altValStr); // parseSaneNumber parses the numbers inside the string -> 111!
        if (altVal !== 0 && !/^\d{1,2}(\.\d+)+/.test(altValStr)) { 
            // BUT "01.1.1" matches /^\d{1,2}(\.\d+)+/ ! So it returns TRUE, !TRUE is FALSE!
            // SO FALLBACK ESCAPES!
            valP = altVal;
            categoriaRaw = String(cols[colCat-1] || '').trim();
        }
    }
    
    // BUT WAIT! What if cols[69] has a number? e.g. "-688.49"
    // Then valP = -688.49. Fallback is skipped!
    // finalAmount = -688.49.
    // categoriaRaw = "01.1.1 - Serviços Vendidos"
    
    // BUT WAIT! My script logged colCat = 15 BEFORE! Why did my parse_test.js log colCat=15?!
    // Because if check_sums.js yielded 150k but parse_test.js logged colCat=14...
    // Let's just run it!
    const finalAmount = isNaN(valP) ? 0 : valP;

    if (!categoriaRaw && Math.abs(finalAmount) === 0) return;

    if (categoriaRaw.includes('01.1')) {
        sumRev += finalAmount;
        validRows.push(finalAmount);
    }
});

console.log("V51.3 Simulated Rev Sum:", sumRev.toFixed(2));
console.log("Valid Rows Array:", validRows.slice(0, 10).join(", ") + " ... (Total: " + validRows.length + ")");
