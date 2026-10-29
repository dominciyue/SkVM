const fs = require('fs');

const { rows } = JSON.parse(fs.readFileSync('rows.json', 'utf8'));
const sum = rows.reduce((total, row) => total + row, 0);

fs.writeFileSync('summary.json', `${JSON.stringify({ sum })}\n`);
fs.writeFileSync('report.txt', `Row count: ${rows.length}\nSum: ${sum}\n`);
