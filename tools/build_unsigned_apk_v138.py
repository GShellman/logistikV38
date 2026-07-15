from pathlib import Path
import zipfile, shutil, struct, hashlib, zlib

base=Path('/mnt/data/Helvetic_Freight_Clean_v1.1.37.apk')
html=Path('/mnt/data/Helvetic_Freight_v1.1.38_CleanApp.html')
out=Path('/mnt/data/Helvetic_Freight_Clean_v1.1.38_unsigned.apk')
work=Path('/mnt/data/apk138build')

if work.exists():
    shutil.rmtree(work)
work.mkdir(parents=True)
with zipfile.ZipFile(base) as z:
    z.extractall(work)
shutil.rmtree(work/'META-INF', ignore_errors=True)

old_asset=work/'assets'/'Helvetic_Freig37.html'
new_asset=work/'assets'/'Helvetic_Freig38.html'
assert old_asset.exists(), old_asset
old_asset.unlink()
new_asset.write_bytes(html.read_bytes())

rp=work/'resources.arsc'
rb=rp.read_bytes()
assert rb.count(b'Helvetic Clean37') == 1
rp.write_bytes(rb.replace(b'Helvetic Clean37', b'Helvetic Clean38'))

dp=work/'classes.dex'
db=bytearray(dp.read_bytes())
old=b'Helvetic_Freig37.html'
new=b'Helvetic_Freig38.html'
assert len(old) == len(new) and db.count(old) == 1
i=db.index(old)
db[i:i+len(old)] = new
# DEX signature/checksum must be recalculated after any byte change.
db[12:32] = hashlib.sha1(db[32:]).digest()
db[8:12] = struct.pack('<I', zlib.adler32(db[12:]) & 0xffffffff)
dp.write_bytes(db)

mp=work/'AndroidManifest.xml'
mb=mp.read_bytes()
old_name='1.1.37'.encode('utf-16le')
new_name='1.1.38'.encode('utf-16le')
assert mb.count(old_name) == 1
mb=mb.replace(old_name, new_name)
old_code=(1137).to_bytes(4, 'little')
new_code=(1138).to_bytes(4, 'little')
pos=[i for i in range(len(mb)) if mb.startswith(old_code, i)]
assert pos == [1600], pos
mb=mb[:pos[0]] + new_code + mb[pos[0]+4:]
mp.write_bytes(mb)

if out.exists():
    out.unlink()
with zipfile.ZipFile(out, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for f in sorted(work.rglob('*')):
        if f.is_file():
            z.write(f, f.relative_to(work).as_posix())
print(out, out.stat().st_size)
