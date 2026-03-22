const https = require("https");
const XLSX = require("xlsx");

function getDbData() {
    return new Promise(resolve => {
        https.get("https://planejamento-or-ament-rio.vercel.app/api/debug-db", (resp) => {
            let data = "";
            resp.on("data", chunk => data += chunk);
            resp.on("end", () => {
                try {
                    console.log("DB connection successful.");
                    resolve(JSON.parse(data));
                } catch(e) {
                    console.log("DB JSON ERROR:", e.message);
                    console.log("Data:", data.substring(0, 200));
                    resolve(null);
                }
            });
        }).on("error", (e) => {
            console.log("HTTPS ERROR:", e.message);
            resolve(null);
        });
    });
}

function getRawData() {
    try {
        const wb = XLSX.readFile("planilha.xlsx", { cellDates: true });
        const wsname = wb.SheetNames.find(n => n.includes("Competência")) || wb.SheetNames[0];
        const data = XLSX.utils.sheet_to_json(wb.Sheets[wsname], { header: 1 });
        
        const parseSaneNumber = (val) => {
            let s = String(val || "").trim().replace(/[R$\s]/g, "");
            if (!s) return 0;
            const lastComma = s.lastIndexOf(",");
            const lastDot = s.lastIndexOf(".");
            if (lastComma > -1 && lastDot > -1) {
                if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
                else s = s.replace(/,/g, "");
            } else if (lastComma > -1) s = s.replace(",", ".");
            else if (lastDot > -1) {
                const parts = s.split(".");
                if (parts[parts.length - 1].length === 3) s = s.replace(/\./g, "");
            }
            return parseFloat(s) || 0;
        };

        let rawRows = [];
        data.forEach((row, idx) => {
            if (idx === 0) return;
            const strRow = JSON.stringify(row);
            if (strRow.includes("01.1.1")) {
                for (let i = 0; i < row.length; i++) {
                    if (String(row[i]).includes("01.1.1")) {
                        const valStr = String(row[i+1] || row[i+2] || row[row.length-1] || "");
                        const val = parseSaneNumber(valStr);
                        if (val > 0 && val < 50000) rawRows.push({ val, full: String(row[5] || row[6] || "").substring(0,20) });
                    }
                }
            }
        });
        return rawRows;
    } catch(e) {
        console.log("XLSX ERROR:", e.message);
        return [];
    }
}

async function main() {
    const dbJson = await getDbData();
    if (!dbJson || !dbJson.detailLogs) return;

    const dbRevs = dbJson.detailLogs.filter(l => l.cat.includes("01")).map(l => l.amount);
    const rawRevs = getRawData();
    
    let missingSum = 0;
    let missingRows = [];
    
    let dbCopy = [...dbRevs];
    
    for (let r of rawRevs) {
        let matchedIdx = dbCopy.findIndex(v => Math.abs(v - r.val) < 0.01);
        if (matchedIdx > -1) {
            dbCopy.splice(matchedIdx, 1);
        } else {
            missingSum += r.val;
            missingRows.push(r.val + " [" + r.full + "]");
        }
    }
    
    console.log("=== MISSING ROWS FROM RAW EXCEL IN DB ===");
    missingRows.forEach(m => console.log(m));
    console.log("Total Missing Sum:", missingSum.toFixed(2));
}
main();
