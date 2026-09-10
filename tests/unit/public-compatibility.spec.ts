// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { openPublicDialog, closePublicDialog } from '../../app/utils/public-dialog'
import { writePublicClipboard } from '../../app/utils/public-clipboard'
import { readPublicSelectedItems } from '../../shared/utils/public-selection'
import { readPublicCitationPage } from '../../shared/utils/public-citation'
afterEach(()=>{vi.unstubAllGlobals();document.body.replaceChildren()})
const batch=(uids:string[],numbers?:number[])=>({schemaVersion:1,module:'research',locale:'en',revision:'a'.repeat(64),totalPublic:200,uids,items:uids.map((uid,i)=>({uid,name:uid,description:'Complete text',displayNumber:numbers?.[i]??Number(uid)})),unavailableUids:[]}) as any
const request=(uids:string[])=>({module:'research',locale:'en',uids}) as const
const basicSignal=()=>({aborted:false}) as AbortSignal

describe('capability-based compatibility',()=>{
 it('uses native modal open and close when available',()=>{
  const dialog=document.createElement('dialog');document.body.append(dialog)
  const open=vi.spyOn(dialog,'showModal'),close=vi.spyOn(dialog,'close')
  openPublicDialog(dialog);expect(open).toHaveBeenCalledOnce();expect(dialog.open).toBe(true)
  closePublicDialog(dialog);expect(close).toHaveBeenCalledOnce();expect(dialog.open).toBe(false)
 })
 it('offers an in-flow focusable preview without native dialog APIs',()=>{
  const dialog=document.createElement('dialog');dialog.innerHTML='<button>Close</button>';document.body.append(dialog)
  Object.defineProperty(dialog,'showModal',{value:undefined});Object.defineProperty(dialog,'close',{value:undefined})
  openPublicDialog(dialog);expect(dialog.hasAttribute('open')).toBe(true);expect(dialog.dataset.inlineFallback).toBe('true')
  expect(dialog.getAttribute('aria-modal')).toBe('false');expect(document.activeElement).toBe(dialog.querySelector('button'))
  closePublicDialog(dialog);expect(dialog.hasAttribute('open')).toBe(false)
 })
 it('rejects missing clipboard capabilities so the UI can offer manual copying',async()=>{
  vi.stubGlobal('navigator',{})
  await expect(writePublicClipboard({text:'Original',html:'<p>Original</p>'})).rejects.toThrow()
 })
 it('prepares all 200 selections in at most 12-item sequential requests without newer abort methods',async()=>{
  const uids=Array.from({length:200},(_,i)=>String(i+1)),sizes:number[]=[];let running=0
  const result=await readPublicSelectedItems(request(uids),async chunk=>{
   expect(++running).toBe(1);sizes.push(chunk.length);await Promise.resolve();running--;return batch(chunk)
  },basicSignal())
  expect(sizes).toEqual([...Array(16).fill(12),8]);expect(result.items).toHaveLength(200)
  expect(result.items.map(item=>item.displayNumber)).toEqual(Array.from({length:200},(_,i)=>200-i))
 })
 it('discards cross-batch duplicate original numbers',async()=>{
  const uids=Array.from({length:13},(_,i)=>String(i+1))
  await expect(readPublicSelectedItems(request(uids),async chunk=>batch(chunk,chunk.length===1?[1]:undefined),basicSignal())).rejects.toThrow('protocol')
 })
 it('stops a legacy aborted signal before requesting selected data',async()=>{
  const load=vi.fn();await expect(readPublicSelectedItems(request(['1']),load,{aborted:true} as AbortSignal)).rejects.toThrow('aborted')
  expect(load).not.toHaveBeenCalled()
 })
 it('reads citations without AbortSignal.throwIfAborted and keeps current version checks',async()=>{
  const citation={style:'gbt',label:'GB/T',text:'Full reference',status:'saved',highlights:[]}
  const result=await readPublicCitationPage({locale:'en',style:'gbt',revision:'a'.repeat(64),totalPublic:1,items:[{uid:'1',displayNumber:1}]},async()=>({...batch(['1']),module:'publications',totalPublic:1,citationStyle:'gbt',items:[{uid:'1',displayNumber:1,citation}]}),basicSignal())
  expect(result.entries[0]?.citation.text).toBe('Full reference')
 })
})
