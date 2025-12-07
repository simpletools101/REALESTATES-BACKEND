const fs = require('fs');

// Read the file
const filePath = 'server/storage.ts';
let content = fs.readFileSync(filePath, 'utf8');

// Find all squareMeters: X values and convert them
const regex = /squareMeters: (\d+),/g;
content = content.replace(regex, (match, sqft) => {
  // Convert square feet to square meters (1 sq ft = 0.093 sq m)
  const sqm = Math.round(parseInt(sqft) * 0.093);
  return `squareMeters: ${sqm},`;
});

// Write the file back
fs.writeFileSync(filePath, content);
console.log('Conversion completed!');
