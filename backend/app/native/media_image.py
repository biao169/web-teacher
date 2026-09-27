"""裁剪输出的轻量头部检查；不解码图片，不执行服务端裁剪或引入图像依赖。"""
import struct,zlib
from .catalog import Error

def crop_dimensions(data,mime):
    """从PNG IHDR或JPEG SOF读取尺寸，拒绝截断头部及64–4096范围之外的输出。"""
    width=height=0
    if mime=='image/png':
        if len(data)<45 or data[:8]!=b'\x89PNG\r\n\x1a\n' or data[8:16]!=b'\0\0\0\rIHDR':raise Error('裁剪PNG头部无效')
        if zlib.crc32(data[12:29])!=struct.unpack('>I',data[29:33])[0]:raise Error('裁剪PNG头部校验失败')
        width,height=struct.unpack('>II',data[16:24])
    elif mime=='image/jpeg':
        if data[:2]!=b'\xff\xd8' or data[-2:]!=b'\xff\xd9':raise Error('裁剪JPEG文件不完整')
        pos=2
        while pos+4<=len(data):
            if data[pos]!=255:break
            while pos<len(data) and data[pos]==255:pos+=1
            if pos>=len(data):break
            marker=data[pos];pos+=1
            if marker in (0xda,0xd9):break
            if marker==0x01 or 0xd0<=marker<=0xd7:continue
            if pos+2>len(data):break
            length=int.from_bytes(data[pos:pos+2],'big')
            if length<2 or pos+length>len(data):break
            if marker in (0xc0,0xc1,0xc2):
                if length<8:break
                height,width=struct.unpack('>HH',data[pos+3:pos+7]);break
            pos+=length
    else:raise Error('裁剪输出仅支持PNG或JPEG')
    if not 64<=width<=4096 or not 64<=height<=4096:raise Error('裁剪输出的宽和高必须都在64–4096像素之间')
    return width,height
