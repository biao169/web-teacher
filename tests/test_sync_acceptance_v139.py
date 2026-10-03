"""Local streaming memory bound; no claim about remote Worker CPU or JS heap."""
import asyncio,hashlib,tracemalloc
import pytest
from backend.app.native.storage import LocalStore
from backend.app.native.site_sync_stream import compose,checksum

@pytest.mark.parametrize('size',[1024*1024,20*1024*1024])
def test_local_stream_copy_and_digest_do_not_buffer_entire_file(tmp_path,size,record_property):
 source=LocalStore(tmp_path/'cache');target=LocalStore(tmp_path/'media')
 source.root.mkdir(parents=True,exist_ok=True)
 block=b'x'*65536;expected=hashlib.sha256()
 with source.path('input.bin').open('wb') as f:
  for _ in range(size//len(block)):f.write(block);expected.update(block)
 async def operation():
  await compose(source,target,[('input.bin',size)],'result.bin',exclusive=True)
  return await checksum(target,'result.bin',size)
 tracemalloc.start()
 try:
  actual=asyncio.run(operation());_,peak=tracemalloc.get_traced_memory()
 finally:tracemalloc.stop()
 record_property('file_bytes',size);record_property('python_peak_bytes',peak)
 assert actual==expected.hexdigest()
 assert target.path('result.bin').stat().st_size==size
 assert peak<1024*1024,peak
 assert not list(target.root.glob('*.tmp'))
