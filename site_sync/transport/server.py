"""Read-only local peer handler. Mount on a separate bounded server in step 5.
source.authorize(module, record) MUST enforce this peer's outgoing scope.
Source methods pin immutable versions; media returns an already-open versioned
file/object, never a user-provided path. TLS terminates at the trusted proxy.
"""
import json
import time
from http.server import BaseHTTPRequestHandler
from .protocol import *


def handler(source,secret,*,clock=time.time):
    class PeerHandler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass # Host emits bounded structured counters later.
        def do_POST(self):
            media=None
            try:
                if self.path!=PATH:self.send_error(404);return
                self.connection.settimeout(20)
                if self.headers.get('Transfer-Encoding'):raise ValueError('No chunked control')
                n=int(self.headers.get('Content-Length','-1'))
                if not 0<n<=MAX_REQUEST:raise ValueError('Invalid length')
                body=self.rfile.read(n)
                if len(body)!=n:raise ValueError('Truncated request')
                nonce=verify_request(secret,self.headers,body,clock=clock)
                q=json.loads(body)
                if not isinstance(q,dict) or q.get('kind') not in ('manifest','slice','media','candidates'):raise ValueError('Unknown request')
                if q['kind']=='candidates':
                    if q.get('version')!='catalog-v1':raise ValueError('Catalog version')
                    data=encode(source.candidates(q));meta={'version':'catalog-v1'}
                    if len(data)>MAX_CONTROL:raise ValueError('Candidate response bound')
                else:
                    if any(not isinstance(q.get(k),str) or not 0<len(q[k])<=256 for k in ('module','record','version')):raise ValueError('Invalid identity')
                    source.authorize(q['module'],q['record'])
                if q['kind']=='candidates':pass
                elif q['kind']=='manifest':
                    data=encode(manifest(source.manifest(q),q['version']));meta={'version':q['version']}
                else:
                    offset,length=q.get('offset'),q.get('length')
                    cap=5*1024*1024 if q['kind']=='media' else MAX_SLICE
                    if type(offset)!=int or offset<0 or type(length)!=int or not 0<length<=cap:raise ValueError('Invalid range')
                    if q['kind']=='slice':
                        data=source.slice(q)
                        if not isinstance(data,bytes) or len(data)!=length:raise ConflictError('Source range changed')
                        meta={'version':q['version'],'offset':offset}
                    else:
                        total=q.get('total')
                        if type(total)!=int or not 0<total<=MAX_MEDIA or offset+length>total:raise ValueError('Invalid total')
                        media=source.media(q) # Version and size verified on this open handle.
                        data=b'';meta={'version':q['version'],'offset':offset,'length':length,'total':total}
                headers=response_headers(secret,nonce,200,meta,data,stream=media is not None)
                self.send_response(200)
                for k,v in headers.items():self.send_header(k,v)
                self.end_headers()
                if media is None:self.wfile.write(data)
                else:
                    left=q['length']
                    while left:
                        chunk=media.read(min(left,65536))
                        if not chunk:raise IOError('Source ended early')
                        if len(chunk)>left:raise IOError('Source range overflow')
                        self.wfile.write(chunk);left-=len(chunk)
            except AuthorizationError:self.send_error(403)
            except (ConflictError,ValueError,KeyError,TypeError):self.send_error(409)
            except (OSError,TimeoutError):self.close_connection=True
            finally:
                if media is not None:media.close()
    return PeerHandler
