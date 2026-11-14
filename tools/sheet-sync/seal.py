# seal.py <public_key.pem> <import.json> <out.enc> : RSA-OAEP(SHA-1) wraps an AES-256-GCM key over the gzipped JSON.
import sys, os, json, gzip, base64
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
pub = serialization.load_pem_public_key(open(sys.argv[1], 'rb').read())
key = os.urandom(32); iv = os.urandom(12)
ct = AESGCM(key).encrypt(iv, gzip.compress(open(sys.argv[2], 'rb').read()), None)
wrapped = pub.encrypt(key, padding.OAEP(mgf=padding.MGF1(hashes.SHA1()), algorithm=hashes.SHA1(), label=None))
b = lambda x: base64.b64encode(x).decode()
json.dump({'v': 1, 'key': b(wrapped), 'iv': b(iv), 'tag': b(ct[-16:]), 'data': b(ct[:-16])}, open(sys.argv[3], 'w'))
print('sealed', os.path.getsize(sys.argv[3]) // 1024, 'KB')
