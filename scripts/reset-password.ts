import crypto from 'crypto'

const PASSWORD = process.env.RESET_PASSWORD
if (!PASSWORD) {
  console.error('Set RESET_PASSWORD env var')
  process.exit(1)
}

const salt = crypto.randomBytes(32).toString('hex')
const hash = crypto.pbkdf2Sync(PASSWORD, salt, 25000, 512, 'sha256').toString('hex')

console.log(`salt=${salt}`)
console.log(`hash=${hash}`)
