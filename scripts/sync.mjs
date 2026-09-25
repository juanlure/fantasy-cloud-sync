import {createCipheriv,randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {fetchSnapshot} from '../lib/biwenger.mjs';

const key=Buffer.from(process.env.SNAPSHOT_KEY||'','hex');
if(key.length!==32)throw Error('SNAPSHOT_KEY must be 32 bytes');
const snapshot=await fetchSnapshot(process.env.BIWENGER_TOKEN);
if(!snapshot.ownVerified||snapshot.intelligence?.available!==true)throw Error('Snapshot incomplete; preserving prior publication');
const expected=Number(process.env.BW_EXPECTED_USERS);
if(!Number.isSafeInteger(expected)||snapshot.rows.length!==expected)throw Error('Unexpected league size; preserving prior publication');

const nonce=randomBytes(12);
const cipher=createCipheriv('aes-256-gcm',key,nonce);
const ciphertext=Buffer.concat([cipher.update(JSON.stringify(snapshot),'utf8'),cipher.final()]);
const envelope={v:1,n:nonce.toString('base64'),c:ciphertext.toString('base64'),t:cipher.getAuthTag().toString('base64')};
writeFileSync('snapshot.enc',JSON.stringify(envelope)+'\n',{mode:0o600});
console.log('Published encrypted, validated snapshot at '+snapshot.capturedAt+' with '+snapshot.rows.length+' teams.');
