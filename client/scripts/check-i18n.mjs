import fs from 'node:fs'
import path from 'node:path'
import ts from 'typescript'
const root = new URL('../', import.meta.url)
const read = name => JSON.parse(fs.readFileSync(new URL(`messages/${name}.json`, root), 'utf8'))
const en = read('en'), ru = read('ru')
const issues = []
const parameters = value => [...new Set(value.match(/\{\w+\}/g) ?? [])].sort().join(',')
for (const ns of new Set([...Object.keys(en), ...Object.keys(ru)])) {
  for (const key of new Set([...Object.keys(en[ns] ?? {}), ...Object.keys(ru[ns] ?? {})])) {
    const a = en[ns]?.[key], b = ru[ns]?.[key]
    if (typeof a !== 'string' || typeof b !== 'string' || !a.trim() || !b.trim()) issues.push(`Missing or empty translation: ${ns}.${key}`)
    else if (parameters(a) !== parameters(b)) issues.push(`Parameter mismatch: ${ns}.${key}`)
  }
}
function scan(directory) {
  for (const file of fs.readdirSync(directory, { withFileTypes: true })) {
    const name = path.join(directory, file.name)
    if (file.isDirectory()) { if (!name.endsWith('/app/api') && !name.endsWith('/lib/server')) scan(name); continue }
    if (!/\.(ts|tsx)$/.test(name) || /\.(test|spec)\.|schema\.d\.ts/.test(name)) continue
    const source = ts.createSourceFile(name, fs.readFileSync(name, 'utf8'), ts.ScriptTarget.Latest, true)
    function visit(node) {
      if ((ts.isStringLiteral(node) || ts.isJsxText(node) || ts.isNoSubstitutionTemplateLiteral(node)) && /[А-Яа-яЁё]/.test(node.text) && node.text !== 'Русский') issues.push(`Inline Russian text: ${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
      if (ts.isCallExpression(node) && ['lt', 'localMessage', 'message'].includes(node.expression.getText(source)) && ts.isStringLiteral(node.arguments[0]) && !(node.arguments[0].text in en.ui)) issues.push(`Unknown UI key: ${node.arguments[0].text} in ${name}`)
      if (ts.isJsxText(node) && /[A-Za-zА-Яа-яЁё]/.test(node.text) && !['EN', 'RU', 'G'].includes(node.text.trim())) issues.push(`Inline UI text: ${name}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`)
      if (ts.isCallExpression(node) && ['lt', 'localMessage', 'message'].includes(node.expression.getText(source)) && ts.isStringLiteral(node.arguments[0]) && node.arguments[0].text in en.ui) {
        const expected = parameters(en.ui[node.arguments[0].text])
        const argument = node.arguments[1]
        const actual = argument && ts.isObjectLiteralExpression(argument)
          ? argument.properties.map(property => `{${property.name?.getText(source).replace(/['"]/g, '')}}`).sort().join(',') : ''
        if ((!argument || ts.isObjectLiteralExpression(argument)) && expected !== actual) issues.push(`Call parameter mismatch: ${node.arguments[0].text} in ${name}`)
      }
      ts.forEachChild(node, visit)
    }
    visit(source)
  }
}
for (const directory of ['app', 'features', 'components', 'lib', 'i18n']) scan(new URL(directory, root).pathname)
if (issues.length) { console.error(issues.join('\n')); process.exitCode = 1 }
else console.log(`EN/RU verified: ${Object.values(en).reduce((count, ns) => count + Object.keys(ns).length, 0)} matching translations; no inline Russian UI text.`)
