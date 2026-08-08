const fs = require('fs');
const sodium = require('libsodium-wrappers');

const OWNER = 'ddelza';
const REPO = 'sedu22-mirror';
const SECRET_NAME = 'CAFE_SESSION';
const TOKEN = process.env.GITHUB_PAT;

async function main() {
  if (!TOKEN) throw new Error('GITHUB_PAT not set in this process env');
  await sodium.ready;

  const pkRes = await fetch(`https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/public-key`, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json' },
  });
  const pk = await pkRes.json();
  if (!pk.key) throw new Error('public key fetch failed: ' + JSON.stringify(pk));

  const secretValue = fs.readFileSync('session.json', 'utf8');
  const messageBytes = sodium.from_string(secretValue);
  const keyBytes = sodium.from_base64(pk.key, sodium.base64_variants.ORIGINAL);
  const encryptedBytes = sodium.crypto_box_seal(messageBytes, keyBytes);
  const encryptedValue = sodium.to_base64(encryptedBytes, sodium.base64_variants.ORIGINAL);

  const putRes = await fetch(
    `https://api.github.com/repos/${OWNER}/${REPO}/actions/secrets/${SECRET_NAME}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ encrypted_value: encryptedValue, key_id: pk.key_id }),
    }
  );
  console.log('status:', putRes.status);
  const text = await putRes.text();
  console.log(text || '(no body - success)');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
