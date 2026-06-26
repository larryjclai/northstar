import fs from 'fs';
import path from 'path';

function findFiles(dir, filter, fileList = []) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      findFiles(filePath, filter, fileList);
    } else if (filter(filePath)) {
      fileList.push(filePath);
    }
  }
  return fileList;
}

const files = [
  ...findFiles('./src/routes', f => f.endsWith('.tsx')),
  ...findFiles('./src/components', f => f.endsWith('.tsx'))
];

let totalReplaced = 0;

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  let changed = false;

  // Find all instances of className="ns-eyebrow" or className={`ns-eyebrow ...`}
  // We'll use a regex replacement with a function to evaluate each match.
  const regex = /(<(div|label|span|h\d)[^>]*)className=(?:(["'])ns-eyebrow\3|\{`ns-eyebrow([^`]*)`\})([^>]*>)(.*?)(<\/\2>)/gs;

  content = content.replace(regex, (match, p1_start, tag, quote, templateRest, p5_end, innerContent, p7_close) => {
    // Pattern C check: step indicators
    if (innerContent.includes('步驟') || /^\s*\d+\s*·\s*/.test(innerContent)) {
      return match; // Keep as is
    }

    // Determine new class name string
    let newClassAttr = '';
    if (quote) {
       newClassAttr = `className="text-xs"`;
    } else if (templateRest) {
       newClassAttr = `className={\`text-xs\${"${templateRest}"}\`}`;
    }

    let beforeStyle = p1_start;
    let afterStyle = p5_end;

    // Check if style prop exists
    const styleRegex = /style=\{\{([^}]+)\}\}/;
    const styleMatchBefore = beforeStyle.match(styleRegex);
    const styleMatchAfter = afterStyle.match(styleRegex);
    const addedStyle = styleMatchBefore && styleMatchBefore[1].includes('color:') 
      ? `fontWeight: 500`
      : styleMatchAfter && styleMatchAfter[1].includes('color:')
      ? `fontWeight: 500`
      : `color: "var(--ns-fg-muted)", fontWeight: 500`;

    if (styleMatchBefore) {
      const mergedStyle = `style={{ ${styleMatchBefore[1]}, ${addedStyle} }}`;
      beforeStyle = beforeStyle.replace(styleRegex, mergedStyle);
    } else if (styleMatchAfter) {
      const mergedStyle = `style={{ ${styleMatchAfter[1]}, ${addedStyle} }}`;
      afterStyle = afterStyle.replace(styleRegex, mergedStyle);
    } else {
      // No style prop, add it to afterStyle
      afterStyle = ` style={{ ${addedStyle} }}` + afterStyle;
    }

    changed = true;
    totalReplaced++;
    return `${beforeStyle}${newClassAttr}${afterStyle}${innerContent}${p7_close}`;
  });

  // There are some cases where it might just be `className="ns-eyebrow "` (with extra spaces/classes)
  // Let's do a broader regex if the first didn't catch everything, but safely.
  const broadRegex = /(<(div|label|span|h\d)[^>]*)className=["']([^"']*)ns-eyebrow([^"']*)["']([^>]*>)(.*?)(<\/\2>)/gs;
  content = content.replace(broadRegex, (match, p1, tag, classBefore, classAfter, p5, innerContent, p7) => {
    if (innerContent.includes('步驟') || /^\s*\d+\s*·\s*/.test(innerContent)) {
      return match;
    }
    
    // We already handled exact matches, this is for e.g. "ns-eyebrow mb-2"
    if (classBefore === "" && classAfter === "") return match; // Handled by first regex

    const newClasses = (classBefore + " text-xs " + classAfter).replace(/\s+/g, ' ').trim();
    const newClassAttr = `className="${newClasses}"`;

    let beforeStyle = p1;
    let afterStyle = p5;

    const styleRegex = /style=\{\{([^}]+)\}\}/;
    const styleMatchBefore = beforeStyle.match(styleRegex);
    const styleMatchAfter = afterStyle.match(styleRegex);

    const addedStyle2 = styleMatchBefore && styleMatchBefore[1].includes('color:')
      ? `fontWeight: 500`
      : styleMatchAfter && styleMatchAfter[1].includes('color:')
      ? `fontWeight: 500`
      : `color: "var(--ns-fg-muted)", fontWeight: 500`;

    if (styleMatchBefore) {
      const mergedStyle = `style={{ ${styleMatchBefore[1]}, ${addedStyle2} }}`;
      beforeStyle = beforeStyle.replace(styleRegex, mergedStyle);
    } else if (styleMatchAfter) {
      const mergedStyle = `style={{ ${styleMatchAfter[1]}, ${addedStyle2} }}`;
      afterStyle = afterStyle.replace(styleRegex, mergedStyle);
    } else {
      afterStyle = ` style={{ ${addedStyle2} }}` + afterStyle;
    }

    changed = true;
    totalReplaced++;
    return `${beforeStyle}${newClassAttr}${afterStyle}${innerContent}${p7}`;
  });

  if (changed) {
    fs.writeFileSync(file, content, 'utf-8');
    console.log(`Updated ${file}`);
  }
}

console.log(`Total replacements made: ${totalReplaced}`);
