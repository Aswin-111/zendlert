const crypto = require('crypto');
const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const pub = publicKey.export({ type: 'spki', format: 'pem' }).replace(/\n/g, '\\n');
const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).replace(/\n/g, '\\n');
console.log('SERVER_RSA_PUBLIC_KEY="' + pub + '"');
console.log('SERVER_RSA_PRIVATE_KEY="' + priv + '"');