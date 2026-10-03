const { spawn } = require('node:child_process')
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), [process.argv[2] || 'scripts/smoke.cjs'], {
  env,
  stdio: 'inherit',
  windowsHide: true,
})
child.on('exit', (code) => process.exit(code || 0))
