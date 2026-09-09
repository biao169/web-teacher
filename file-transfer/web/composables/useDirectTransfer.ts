import { shallowRef, useNuxtApp } from '#imports'
import { DirectPeer } from '../files/peer.mjs'
import type { ShallowRef } from 'vue'
import type { PeerState } from '../files/peer.mjs'
const workspaces = new WeakMap<object, {state: ShallowRef<PeerState>; peer: DirectPeer}>()
export function useDirectTransfer(ticket: (role:string,transport?:string) => Promise<{ticket:string;networks:string;signalPath:string}>) {
  const app = useNuxtApp(); let workspace = workspaces.get(app)
  if (!workspace) { const state = shallowRef<PeerState>(); const peer = new DirectPeer({ticket, onState: value => { state.value = value }}); state.value = peer.state; workspace = {state: state as ShallowRef<PeerState>, peer}; workspaces.set(app, workspace) }
  return workspace
}
