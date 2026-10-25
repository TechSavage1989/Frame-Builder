"""Update a supplied portable Windows folder without changing its runtime.
Usage: python package_portable_update.py desktop_source baseline_release
The ASAR writer verifies a byte-identical round trip of the input archive
and validates each embedded SHA256 before and after the update.
"""
from pathlib import Path
import hashlib,json,struct,sys,subprocess
root=Path(__file__).resolve().parent.parent
desktop=Path(sys.argv[1]).resolve();baseline=Path(sys.argv[2]).resolve()
source=baseline/'Windows_x64/resources/app.asar';target=root/'Windows_x64/resources/app.asar'
def sha(b): return hashlib.sha256(b).hexdigest()
def unpack(data):
    marker,header_size,payload_size,json_size=struct.unpack_from('<IIII',data)
    assert marker==4 and header_size==payload_size+4
    assert payload_size==((4+json_size+3)//4)*4
    header=json.loads(data[16:16+json_size]);start=8+header_size;entries=[]
    def walk(node,path=''):
        for name,item in node['files'].items():
            relative=f'{path}/{name}'.lstrip('/')
            if 'files' in item: walk(item,relative)
            else:
                assert not item.get('unpacked') and 'link' not in item
                offset=int(item['offset']);b=data[start+offset:start+offset+item['size']]
                assert len(b)==item['size']
                if 'integrity' in item:
                    assert item['integrity']['algorithm']=='SHA256'
                    assert sha(b)==item['integrity']['hash']
                    size=item['integrity']['blockSize']
                    assert [sha(b[i:i+size]) for i in range(0,len(b),size)]==item['integrity']['blocks']
                entries.append((offset,relative,item,b))
    walk(header);return header,sorted(entries)
def pack(header,entries,replacements):
    data=bytearray()
    for _,name,item,original in entries:
        b=replacements.get(name,original);item['offset']=str(len(data));item['size']=len(b)
        if 'integrity' in item:
            size=item['integrity']['blockSize'];item['integrity']['hash']=sha(b)
            item['integrity']['blocks']=[sha(b[i:i+size]) for i in range(0,len(b),size)]
        data.extend(b)
    text=json.dumps(header,ensure_ascii=False,separators=(',',':')).encode()
    padding=(-(4+len(text)))%4;payload=4+len(text)+padding
    return struct.pack('<IIII',4,payload+4,payload,len(text))+text+b'\0'*padding+data
checks=subprocess.run(['node','--test','scripts/desktop.test.cjs'],cwd=desktop,text=True,capture_output=True,check=True)
assert '# pass 5' in checks.stdout and '# fail 0' in checks.stdout,'Desktop checks did not pass'
original=source.read_bytes();header,entries=unpack(original)
assert pack(header,entries,{})==original,'ASAR round-trip mismatch'
embedded={name:b for _,name,_,b in entries};metadata=json.loads(embedded['package.json']);metadata['version']='3.51.6'
replacements={'app/index.html':(desktop/'app/index.html').read_bytes(),'package.json':(json.dumps(metadata,indent=2)+'\n').encode()}
result=pack(header,entries,replacements);target.write_bytes(result)
_,check=unpack(result);checked={name:b for _,name,_,b in check}
assert json.loads(checked['package.json'])['version']=='3.51.6'
for key,b in embedded.items(): assert checked[key]==replacements.get(key,b),key
assert b'V3510_ADAPTIVE_EASEL_CLOSED_PROFILES' in checked['app/index.html']
assert (root/'Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html').read_bytes()==(desktop/'browser/Canvas_Frame_v3_51_6_Builder_and_3D_Viewer.html').read_bytes()
exe=root/'Windows_x64/Canvas Frame Builder.exe';oldexe=baseline/'Windows_x64/Canvas Frame Builder.exe'
assert sha(exe.read_bytes())==sha(oldexe.read_bytes())
head=exe.read_bytes()[:1024];pe=struct.unpack_from('<I',head,0x3c)[0]
assert head[:2]==b'MZ' and head[pe:pe+4]==b'PE\0\0' and struct.unpack_from('<H',head,pe+4)[0]==0x8664
report={'version':'3.51.6','baseline':'3.51.0','packaging':'Updated application ASAR in the existing Windows x64 portable runtime','asarRoundTripVerified':True,'asarEntriesChecked':len(check),'asarEntryIntegrityVerified':True,'embeddedHTMLMatchesDesktopSource':True,'standaloneHTMLMatchesBrowserSource':True,'runtimeUnchanged':True,'windowsTarget':'x64','desktopTestsPassed':5,'asarSHA256':sha(result),'windowsLaunchTested':False,'errors':[]}
(root/'Validation/Desktop_Build_Checks.json').write_text(json.dumps(report,indent=2))
(desktop/'Desktop_Build_Checks.json').write_text(json.dumps(report,indent=2))
(root/'Windows_x64/VERSION.txt').write_text('Canvas Frame Builder application: 3.51.1\nAdaptive easel, shared tab datums and closed smooth profiles.\nPortable Windows x64 runtime retained from the supplied application.\nNative Windows launch has not been tested in this environment.\n')
print(json.dumps(report,indent=2))
