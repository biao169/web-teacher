import {WorkerEntrypoint} from 'cloudflare:workers';
import {sourceMedia} from './source_media.mjs';
import {dispatch} from './native_dispatch.mjs';
export default class Native extends WorkerEntrypoint {
  async read(raw){return dispatch(this.env,'read',raw);}
  async step(raw){return dispatch(this.env,'step',raw);}
  async discard(raw){return dispatch(this.env,'discard',raw);}
  async fetch(request){return sourceMedia(this.env,request);}
}
