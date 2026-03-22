const https = require("https");

function getDbData() {
    return new Promise(resolve => {
        https.get("https://planejamento-or-ament-rio.vercel.app/api/debug-db", (resp) => {
            let data = "";
            resp.on("data", chunk => data += chunk);
            resp.on("end", () => {
                try { resolve(JSON.parse(data)); } catch(e) { resolve(null); }
            });
        });
    });
}

const v513_array = [5290.28, 4091.99, 5206.34, 5290.28, 5290.28, 4907.05, 9814.1, 1004.21, 4085.69, 3574.97, 12009.68, 244.26, 4134.38, 9565.65, 6314.28, 6314.28, 10025.22, 9565.65, 9565.65, 5022.51, 9565.65];

async function main() {
    const dbJson = await getDbData();
    if (!dbJson) return;

    const dbRevs = dbJson.detailLogs.filter(l => l.cat.includes("01"));
    const v513Copy = [...v513_array];
    
    let dbMissingInV513 = [];
    let v513MissingInDb = [];

    dbRevs.forEach(db => {
        let matchedIdx = v513Copy.findIndex(v => Math.abs(v - db.amount) < 0.01);
        if (matchedIdx > -1) {
            v513Copy.splice(matchedIdx, 1);
        } else {
            dbMissingInV513.push(db);
        }
    });

    console.log("=== ROWS IN DB THAT ARE **NOT** IN V51.3 SIMULATION ===");
    let addedSum = 0;
    dbMissingInV513.forEach(m => {
        console.log(`+ ${m.amount.toFixed(2)} | CC: ${m.loc} | Desc: ${m.desc.substring(0, 40)}`);
        addedSum += m.amount;
    });
    console.log("Total Added:", addedSum.toFixed(2));

    console.log("\n=== ROWS IN V51.3 SIMULATION THAT ARE **NOT** IN DB ===");
    let droppedSum = 0;
    v513Copy.forEach(m => {
        console.log(`- ${m.toFixed(2)}`);
        droppedSum += m;
    });
    console.log("Total Dropped:", droppedSum.toFixed(2));

    console.log(`DB Total: ${dbJson.totalRevenue.toFixed(2)}`);
}
main();
