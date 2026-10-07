import {Coordinator} from './sync_coordinator.mjs';
import {WorkerEntrypoint,DurableObject} from 'cloudflare:workers';
import {sourceMedia} from './source_media.mjs';
import {dispatch} from './native_dispatch.mjs';
export class SyncCoordinator extends DurableObject {
  async wake(){return new Coordinator(this.ctx,this.env).wake();}
  async alarm(){return new Coordinator(this.ctx,this.env).alarm();}
}
export default class Native extends WorkerEntrypoint {
  async wake(){return this.env.SYNC_COORDINATOR.getByName('site').wake();}
  async snapshot_hash(raw){return dispatch(this.env,'snapshot_hash',raw);}
  async read(raw){return dispatch(this.env,'read',raw);}
  async step(raw){return dispatch(this.env,'step',raw);}
  async discard(raw){return dispatch(this.env,'discard',raw);}
  async fetch(request){return sourceMedia(this.env,request);}
}
