const fs = require('fs');
const vm = require('vm');
const html = fs.readFileSync('index.html', 'utf8');
let count = 0;
for (const match of html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
  if (match[1].trim()) { new vm.Script(match[1]); count++; }
}
new vm.Script(fs.readFileSync('assets/hostinger.js', 'utf8'));
new vm.Script(fs.readFileSync('assets/operations.js', 'utf8'));
new vm.Script(fs.readFileSync('assets/work-orders.js', 'utf8'));
if (!html.startsWith('<meta charset="utf-8">')) throw Error('Missing UTF-8 declaration');
if (!html.includes('p.status === "In Progress" && sheetStatus(p) !== "Submitted"')) throw Error('Pending sheet filter regressed');
console.log(`${count} inline scripts and Hostinger adapter parse successfully`);

const php = fs.readFileSync('api/index.php', 'utf8');
for (const m of html.matchAll(/U\.(?:add|upd|del|rows|get|watch)\("([a-z_]+)"/g)) {
  if (!php.includes("'" + m[1] + "'")) throw Error('Backend is missing collection: ' + m[1]);
}
